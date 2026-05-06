import type { InternalLink, UrlSnapshot } from "./types";

// Fixture data shaped exactly like the future crawler output. Cluster spread
// is tuned so the matrix has at least one bubble in each meaningful category
// (quick win, investigate, stable, low data) — it is not a random sample.

export const mockSnapshots: UrlSnapshot[] = [
  // Cluster: Schwerlastanhänger
  {
    id: "u-hub-schwerlast",
    url: "/produkte/industrie-schwerlastanhaenger/",
    title: "Industrie-Schwerlastanhänger | Hub",
    h1: "Industrie-Schwerlastanhänger",
    pageType: "hub",
    cluster: "schwerlast",
    indexable: true,
    position: 2.8,
    impressions: 8900,
    clicks: 612
  },
  {
    id: "u-tieflader",
    url: "/produkte/tieflader-mit-auflaufbremse/",
    title: "Tieflader mit Auflaufbremse",
    h1: "Tieflader mit Auflaufbremse",
    pageType: "product",
    cluster: "schwerlast",
    indexable: true,
    position: 7.2,
    impressions: 2400,
    clicks: 120
  },
  {
    id: "u-plattform",
    url: "/produkte/plattformwagen/",
    title: "Plattformwagen für Industrie",
    h1: "Plattformwagen",
    pageType: "product",
    cluster: "schwerlast",
    indexable: true,
    position: 11.8,
    impressions: 1850,
    clicks: 64
  },
  {
    id: "u-industrie",
    url: "/produkte/industrieanhaenger/",
    title: "Industrieanhänger Übersicht",
    h1: "Industrieanhänger",
    pageType: "category",
    cluster: "schwerlast",
    indexable: true,
    position: 3.4,
    impressions: 6700,
    clicks: 510
  },
  {
    id: "u-zubehoer",
    url: "/produkte/zubehoer/",
    title: "Zubehör für Anhänger",
    h1: "Zubehör",
    pageType: "category",
    cluster: "schwerlast",
    indexable: true,
    position: 14.5,
    impressions: 1100,
    clicks: 28
  },
  // Cluster: Ratgeber
  {
    id: "u-ratgeber-auswahl",
    url: "/ratgeber/schwerlastanhaenger-auswahl/",
    title: "Schwerlastanhänger richtig auswählen",
    h1: "Schwerlastanhänger Auswahl",
    pageType: "guide",
    cluster: "ratgeber",
    indexable: true,
    position: 5.6,
    impressions: 3100,
    clicks: 210
  },
  {
    id: "u-ratgeber-kauf",
    url: "/ratgeber/anhaenger-kaufberater/",
    title: "Anhänger Kaufberater",
    h1: "Anhänger Kaufberater",
    pageType: "guide",
    cluster: "ratgeber",
    indexable: true,
    position: 9.1,
    impressions: 1620,
    clicks: 70
  },
  // Cluster: Service
  {
    id: "u-service",
    url: "/service/anfrage/",
    title: "Service Anfrage",
    h1: "Anfrage stellen",
    pageType: "service",
    cluster: "service",
    indexable: true,
    position: 22.4,
    impressions: 480,
    clicks: 12
  },
  {
    id: "u-ersatzteile",
    url: "/service/ersatzteile/",
    title: "Ersatzteile finden",
    h1: "Ersatzteile",
    pageType: "service",
    cluster: "service",
    indexable: true,
    position: 18.0,
    impressions: 720,
    clicks: 19
  },
  {
    id: "u-niche",
    url: "/produkte/spezial-rampensystem/",
    title: "Spezial Rampensystem",
    h1: "Spezial Rampensystem",
    pageType: "product",
    cluster: "schwerlast",
    indexable: true,
    position: 26.1,
    impressions: 110,
    clicks: 2
  }
];

let linkCounter = 0;
const link = (
  source: string,
  target: string,
  anchorText: string,
  anchorClass: InternalLink["anchorClass"],
  placement: InternalLink["placement"] = "content"
): InternalLink => ({
  id: `l-${++linkCounter}`,
  sourceId: source,
  targetId: target,
  anchorText,
  anchorClass,
  placement,
  isContextual: placement === "content",
  isNofollow: false
});

export const mockInternalLinks: InternalLink[] = [
  // Hub outgoing — fans out to its cluster, but Tieflader only gets a weak
  // generic anchor. That is the headline Quick-Win story for this matrix.
  link("u-hub-schwerlast", "u-industrie", "Industrieanhänger", "exact"),
  link("u-hub-schwerlast", "u-industrie", "Übersicht Industrieanhänger", "partial"),
  link("u-hub-schwerlast", "u-plattform", "Plattformwagen", "exact"),
  link("u-hub-schwerlast", "u-zubehoer", "passendes Zubehör", "partial"),
  link("u-hub-schwerlast", "u-tieflader", "mehr erfahren", "generic"),
  link("u-hub-schwerlast", "u-ratgeber-auswahl", "Auswahl-Ratgeber", "exact"),

  // Industrie category links well to peers — but does not link Tieflader.
  link("u-industrie", "u-plattform", "Plattformwagen für Industrie", "exact"),
  link("u-industrie", "u-zubehoer", "Zubehör", "partial", "navigation"),
  link("u-industrie", "u-ratgeber-auswahl", "Schwerlastanhänger Auswahl", "exact"),
  link("u-industrie", "u-hub-schwerlast", "Industrie-Schwerlastanhänger", "exact"),

  // Ratgeber → products, only one strong anchor to Tieflader.
  link("u-ratgeber-auswahl", "u-industrie", "Industrieanhänger", "exact"),
  link("u-ratgeber-auswahl", "u-plattform", "Details", "generic"),
  link("u-ratgeber-auswahl", "u-tieflader", "Tieflader mit Auflaufbremse", "exact"),
  link("u-ratgeber-kauf", "u-industrie", "PI 6000 Reihe", "entity"),

  // Cross-link inside cluster.
  link("u-tieflader", "u-plattform", "ähnliches Modell", "partial"),

  // Image link without alt — surfaces the fix_image_alt recommendation.
  link("u-ratgeber-auswahl", "u-plattform", "", "image_no_alt"),

  // Breadcrumb-style nav back to hub from product pages. Not contextual, but
  // contributes to total inlink count for the peer-median calculation.
  link("u-plattform", "u-hub-schwerlast", "Industrie-Schwerlastanhänger", "branded", "navigation"),
  link("u-tieflader", "u-hub-schwerlast", "Industrie-Schwerlastanhänger", "branded", "navigation"),
  link("u-zubehoer", "u-hub-schwerlast", "Industrie-Schwerlastanhänger", "branded", "navigation"),
  link("u-niche", "u-hub-schwerlast", "Industrie-Schwerlastanhänger", "branded", "navigation"),

  // Footer baseline.
  link("u-hub-schwerlast", "u-service", "Anfrage", "branded", "footer"),
  link("u-industrie", "u-service", "Service", "branded", "footer"),
  link("u-ratgeber-auswahl", "u-service", "Kontakt", "branded", "footer"),
  link("u-plattform", "u-service", "Anfrage stellen", "branded", "footer"),
  link("u-tieflader", "u-service", "Kontakt", "branded", "footer"),
  link("u-zubehoer", "u-service", "Service", "branded", "footer"),
  link("u-ratgeber-kauf", "u-service", "Anfrage", "branded", "footer"),
  link("u-ersatzteile", "u-service", "Anfrage", "branded", "footer"),

  // Service ecosystem.
  link("u-service", "u-ersatzteile", "Ersatzteile", "exact")
];
