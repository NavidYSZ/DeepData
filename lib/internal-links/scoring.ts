import type {
  AnchorClass,
  ExecutiveKpis,
  InternalLink,
  LinkRecommendation,
  OpportunityRow,
  UrlSnapshot
} from "./types";

const ANCHOR_CLASSES: AnchorClass[] = [
  "exact",
  "partial",
  "branded",
  "entity",
  "generic",
  "empty",
  "image_no_alt"
];

// Per-class weight for the anchor-health score. Hand-tuned: exact and entity
// are net positive, generic/empty/image-no-alt are penalties.
const ANCHOR_HEALTH_WEIGHT: Record<AnchorClass, number> = {
  exact: 1.0,
  partial: 0.7,
  entity: 0.6,
  branded: 0.4,
  generic: -0.6,
  empty: -1.0,
  image_no_alt: -0.8
};

function clamp(value: number, min = 0, max = 100) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Map GSC average position to a 0–100 "ranking proximity" score where 100 means
// already in the top results and there is real upside from a small push. A page
// at position 200 contributes 0; the curve flattens past position 30 because
// there is no realistic lift from links alone.
export function rankingProximityFromPosition(position: number) {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position <= 3) return 100;
  if (position <= 10) return 100 - ((position - 3) / 7) * 35; // 100 → 65
  if (position <= 20) return 65 - ((position - 10) / 10) * 35; // 65 → 30
  if (position <= 50) return 30 - ((position - 20) / 30) * 30; // 30 → 0
  return 0;
}

// Returns an anchor-class breakdown as percentages summing to 100 (or all zero
// when there are no inlinks).
export function anchorBreakdown(links: InternalLink[]): Record<AnchorClass, number> {
  const result = Object.fromEntries(ANCHOR_CLASSES.map((c) => [c, 0])) as Record<AnchorClass, number>;
  if (links.length === 0) return result;

  for (const link of links) {
    result[link.anchorClass] += 1;
  }
  for (const klass of ANCHOR_CLASSES) {
    result[klass] = (result[klass] / links.length) * 100;
  }
  return result;
}

export function anchorHealthScore(breakdown: Record<AnchorClass, number>) {
  // Start at 50 so a balanced mix lands mid-range, then add weighted shifts.
  let score = 50;
  for (const klass of ANCHOR_CLASSES) {
    score += (breakdown[klass] / 100) * ANCHOR_HEALTH_WEIGHT[klass] * 50;
  }
  return Math.round(clamp(score));
}

// Cluster median of total inlinks. Used as the peer benchmark.
function clusterMedians(snapshots: UrlSnapshot[], inlinkTotals: Map<string, number>) {
  const byCluster = new Map<string, number[]>();
  for (const snap of snapshots) {
    if (!snap.indexable) continue;
    const arr = byCluster.get(snap.cluster) ?? [];
    arr.push(inlinkTotals.get(snap.id) ?? 0);
    byCluster.set(snap.cluster, arr);
  }
  const medians = new Map<string, number>();
  for (const [cluster, values] of byCluster) {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    medians.set(cluster, median);
  }
  return medians;
}

interface ScoreOptions {
  // Below this many impressions in the lookback window we treat the row as
  // low-data — it shows up in the matrix but in a separate colour band.
  lowDataImpressionThreshold?: number;
}

export function scoreOpportunities(
  snapshots: UrlSnapshot[],
  links: InternalLink[],
  options: ScoreOptions = {}
): OpportunityRow[] {
  const { lowDataImpressionThreshold = 200 } = options;

  // Aggregate inlink statistics per target.
  const linksByTarget = new Map<string, InternalLink[]>();
  const totalInlinks = new Map<string, number>();
  for (const link of links) {
    const arr = linksByTarget.get(link.targetId) ?? [];
    arr.push(link);
    linksByTarget.set(link.targetId, arr);
    totalInlinks.set(link.targetId, (totalInlinks.get(link.targetId) ?? 0) + 1);
  }

  const medians = clusterMedians(snapshots, totalInlinks);
  const maxImpressions = Math.max(1, ...snapshots.map((s) => s.impressions));

  const rows: OpportunityRow[] = [];

  for (const snap of snapshots) {
    if (!snap.indexable) continue;

    const inlinks = linksByTarget.get(snap.id) ?? [];
    const uniqueSources = new Set(inlinks.map((l) => l.sourceId)).size;
    // Useful contextual = in main content with an anchor that actually carries
    // signal. Generic/empty/image-without-alt are excluded because they don't
    // pass real ranking signal even if structurally "in content".
    const usefulContextual = inlinks.filter(
      (l) =>
        l.isContextual &&
        !l.isNofollow &&
        l.anchorClass !== "generic" &&
        l.anchorClass !== "empty" &&
        l.anchorClass !== "image_no_alt"
    ).length;
    const breakdown = anchorBreakdown(inlinks);

    // Peer deficit: how far below cluster median this URL sits in inlink count.
    const peerMedian = medians.get(snap.cluster) ?? 0;
    const peerDeficitPct =
      peerMedian > 0 ? clamp(((peerMedian - inlinks.length) / peerMedian) * 100, -100, 100) : 0;

    // Composite link-deficit score on a 0–100 axis. The 3-link floor reflects
    // the heuristic that a target needs at least three useful editorial links
    // to be considered structurally "supported".
    const contextualDeficit = clamp(((3 - usefulContextual) / 3) * 100);
    const peerDeficit = clamp(peerDeficitPct);
    // Useful contextual links are the harder-to-fake signal, so they get the
    // larger weight; raw peer count only modulates that.
    const linkDeficit = Math.round(clamp(0.4 * peerDeficit + 0.6 * contextualDeficit));

    const rankingProximity = Math.round(clamp(rankingProximityFromPosition(snap.position)));
    const anchorHealth = anchorHealthScore(breakdown);

    const impressionWeight = Math.log10(1 + snap.impressions) / Math.log10(1 + maxImpressions);

    // Geometric mean of the two axes — both must be high for the score to be
    // high. A page that ranks well but is fully linked sits near 0; a page
    // that has zero links but ranks at position 60 also sits low.
    const headroom = Math.sqrt((rankingProximity / 100) * (linkDeficit / 100));
    let quickWin = 100 * (0.7 * headroom + 0.3 * impressionWeight);

    // Anchor bonus: a page with mostly weak anchors gets a small lift since
    // anchor rewriting alone is a cheap win.
    if (breakdown.generic + breakdown.empty + breakdown.image_no_alt >= 50) quickWin += 5;

    const quickWinScore = Math.round(clamp(quickWin));

    const quadrant: OpportunityRow["quadrant"] =
      rankingProximity >= 50 && linkDeficit >= 50
        ? "quick_win"
        : rankingProximity < 50 && linkDeficit >= 50
        ? "link_audit"
        : rankingProximity >= 50 && linkDeficit < 50
        ? "content_audit"
        : "low_priority";

    // Category drives bubble colour. A page with effectively no link deficit is
    // always "stable" regardless of how high its score reaches via ranking
    // proximity alone — there is nothing to fix internally.
    const category: OpportunityRow["category"] =
      snap.impressions < lowDataImpressionThreshold
        ? "low_data"
        : linkDeficit < 20
        ? "stable"
        : quickWinScore >= 65
        ? "quick_win"
        : quickWinScore >= 30
        ? "investigate"
        : "stable";

    rows.push({
      snapshot: snap,
      totalInlinks: inlinks.length,
      uniqueSources,
      contextualLinks: usefulContextual,
      anchorBreakdown: breakdown,
      peerDeficitPct: Math.round(peerDeficitPct),
      rankingProximity,
      linkDeficit,
      anchorHealth,
      quickWinScore,
      quadrant,
      category
    });
  }

  rows.sort((a, b) => b.quickWinScore - a.quickWinScore);
  return rows;
}

// Heuristic recommendations from the scored row + raw inlink list. No LLM —
// each rule fires on a measurable condition. Copy is intentionally plain so
// the UI can render `action` / `why` / `sourceUrl` / `oldAnchor` / `newAnchor`
// verbatim without further translation.
export function buildRecommendations(
  row: OpportunityRow,
  allSnapshots: UrlSnapshot[],
  allLinks: InternalLink[]
): LinkRecommendation[] {
  const recs: LinkRecommendation[] = [];
  const targetLinks = allLinks.filter((l) => l.targetId === row.snapshot.id);
  const sourceIdSet = new Set(targetLinks.map((l) => l.sourceId));
  const targetAnchor = row.snapshot.h1 ?? row.snapshot.title.split("|")[0].trim();

  // Rule 1: a hub in the same cluster has no useful contextual link here.
  const hub = allSnapshots.find(
    (s) => s.cluster === row.snapshot.cluster && s.pageType === "hub" && s.id !== row.snapshot.id
  );
  if (hub) {
    const hubLinks = targetLinks.filter((l) => l.sourceId === hub.id);
    const hasUsefulHubLink = hubLinks.some(
      (l) =>
        l.isContextual &&
        !l.isNofollow &&
        l.anchorClass !== "generic" &&
        l.anchorClass !== "empty" &&
        l.anchorClass !== "image_no_alt"
    );
    if (!hasUsefulHubLink) {
      const weakHubLink = hubLinks.find((l) => l.isContextual);
      recs.push({
        id: `${row.snapshot.id}-hub`,
        targetId: row.snapshot.id,
        kind: "add_hub_link",
        priority: "high",
        action: weakHubLink
          ? "Anchor auf der Übersichtsseite austauschen"
          : "Link von der Übersichtsseite setzen",
        why: weakHubLink
          ? "Auf der wichtigsten Übersichtsseite des Themas zeigt der Link aktuell mit einem schwachen Ankertext hierhin — der gibt kaum Signal."
          : "Die wichtigste Übersichtsseite des Themas verlinkt hier nicht im Inhalt — die Autorität bleibt ungenutzt.",
        sourceUrl: hub.url,
        oldAnchor: weakHubLink?.anchorText,
        newAnchor: targetAnchor
      });
    }
  }

  // Rule 2: at least one generic anchor exists — propose a rewrite.
  const genericLink = targetLinks.find(
    (l) => l.anchorClass === "generic" || l.anchorClass === "empty"
  );
  if (genericLink) {
    const sourceSnap = allSnapshots.find((s) => s.id === genericLink.sourceId);
    recs.push({
      id: `${row.snapshot.id}-anchor`,
      targetId: row.snapshot.id,
      kind: "replace_generic_anchor",
      priority: row.anchorHealth < 40 ? "high" : "medium",
      action: "Schwachen Ankertext ersetzen",
      why: `„${genericLink.anchorText || "(leer)"}" sagt Suchmaschinen nichts über das Linkziel — ein konkreter Anker wirkt direkt.`,
      sourceUrl: sourceSnap?.url,
      oldAnchor: genericLink.anchorText,
      newAnchor: targetAnchor
    });
  }

  // Rule 3: a peer URL in the same cluster is well-linked but does not link
  // here — propose a cross-link.
  const peer = allSnapshots
    .filter(
      (s) =>
        s.cluster === row.snapshot.cluster &&
        s.id !== row.snapshot.id &&
        s.pageType !== "hub" &&
        !sourceIdSet.has(s.id)
    )
    .sort((a, b) => b.impressions - a.impressions)[0];
  if (peer) {
    recs.push({
      id: `${row.snapshot.id}-peer`,
      targetId: row.snapshot.id,
      kind: "cross_link_peer",
      priority: "medium",
      action: "Querverlinkung von einer verwandten Seite setzen",
      why: `${peer.title} behandelt ein eng verwandtes Thema und linkt aktuell nicht hierhin — die thematische Nähe ist ein einfacher zusätzlicher Linkpfad.`,
      sourceUrl: peer.url,
      newAnchor: targetAnchor
    });
  }

  // Rule 4: image link without alt text.
  const imageNoAlt = targetLinks.find((l) => l.anchorClass === "image_no_alt");
  if (imageNoAlt) {
    const sourceSnap = allSnapshots.find((s) => s.id === imageNoAlt.sourceId);
    recs.push({
      id: `${row.snapshot.id}-img`,
      targetId: row.snapshot.id,
      kind: "fix_image_alt",
      priority: "medium",
      action: "Alt-Text am Bildlink ergänzen",
      why: "Ein Bildlink hierhin hat keinen Alt-Text — ohne Alt-Text gibt es null Anker-Signal an Suchmaschinen.",
      sourceUrl: sourceSnap?.url,
      newAnchor: targetAnchor
    });
  }

  return recs;
}

// Approximate Google-search CTR curve for a given average position. Used by
// the executive KPI calculation; deliberately a single global curve since we
// have no per-keyword signal at this stage.
function ctrAtPosition(pos: number): number {
  if (!Number.isFinite(pos) || pos <= 0) return 0;
  if (pos <= 1) return 0.32;
  if (pos <= 2) return 0.18;
  if (pos <= 3) return 0.12;
  if (pos <= 5) return 0.08;
  if (pos <= 10) return 0.04;
  if (pos <= 20) return 0.015;
  return 0.005;
}

// Roll-up KPIs used by the Executive Dashboard view. Estimated clicks
// potential is the additional monthly clicks every quick-win URL would gain
// if it improved its average position by three slots — a deliberate
// undercount, since not every URL can move that far, but it gives a
// defensible "money-on-the-table" number.
export function computeExecutiveKpis(rows: OpportunityRow[]): ExecutiveKpis {
  const highPriorityCount = rows.filter((r) => r.category === "quick_win").length;
  const nearOrphanCount = rows.filter(
    (r) => r.snapshot.indexable && r.totalInlinks <= 2
  ).length;

  let weightedWeak = 0;
  let totalLinks = 0;
  for (const row of rows) {
    const weakPct =
      row.anchorBreakdown.generic +
      row.anchorBreakdown.empty +
      row.anchorBreakdown.image_no_alt;
    weightedWeak += (weakPct / 100) * row.totalInlinks;
    totalLinks += row.totalInlinks;
  }
  const weakAnchorPct = totalLinks > 0 ? Math.round((weightedWeak / totalLinks) * 100) : 0;

  let estimatedClicksPotential = 0;
  for (const row of rows) {
    if (row.category !== "quick_win") continue;
    const targetPos = Math.max(1, row.snapshot.position - 3);
    const lift = ctrAtPosition(targetPos) - ctrAtPosition(row.snapshot.position);
    if (lift > 0) estimatedClicksPotential += row.snapshot.impressions * lift;
  }

  return {
    highPriorityCount,
    nearOrphanCount,
    weakAnchorPct,
    estimatedClicksPotential: Math.round(estimatedClicksPotential)
  };
}
