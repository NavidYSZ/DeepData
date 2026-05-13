import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLatestSerpClusters } from "@/lib/keyword-workspace/serp-cluster";

/**
 * GET /api/nlp/clusters?siteUrl=<gsc-site-url>
 *
 * Returns the latest completed SERP-clustering run for the user's project
 * tied to the given GSC site (or the most recent project as fallback), with
 * each subcluster expanded by its top-demand keyword.
 *
 * Response shape:
 *   {
 *     project: { id, name, gscSiteUrl, updatedAt } | null,
 *     run: { id, generatedAt, topResults, minDemand } | null,
 *     clusters: Array<{
 *       id, name, totalDemand, keywordCount,
 *       topKeyword: { kwRaw, demandMonthly, demandSource } | null,
 *       topDomains: string[]
 *     }>,
 *     message?: string
 *   }
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get("siteUrl");

  // Prefer the most recently-touched project tied to the given site; fall
  // back to the user's most recent project of any site.
  let project = null;
  if (siteUrl) {
    project = await prisma.keywordProject.findFirst({
      where: { userId, gscSiteUrl: siteUrl },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, gscSiteUrl: true, updatedAt: true }
    });
  }
  if (!project) {
    project = await prisma.keywordProject.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, gscSiteUrl: true, updatedAt: true }
    });
  }

  if (!project) {
    return NextResponse.json({
      project: null,
      run: null,
      clusters: [],
      message:
        "No KeywordProject found for this user. Create one in /keyword-workspace first."
    });
  }

  const data = await getLatestSerpClusters(project.id);
  if (!data) {
    return NextResponse.json({
      project,
      run: null,
      clusters: [],
      message:
        "No completed SERP-clustering run for this project. Run one in /keyword-workspace first."
    });
  }

  const clusters = data.subclusters.map((s) => {
    const sortedKeywords = [...s.keywords].sort(
      (a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0)
    );
    const top = sortedKeywords[0];
    return {
      id: s.id,
      name: s.name,
      totalDemand: s.totalDemand,
      keywordCount: s.keywordCount,
      topKeyword: top
        ? {
            kwRaw: top.kwRaw,
            demandMonthly: top.demandMonthly,
            demandSource: top.demandSource
          }
        : null,
      topDomains: s.topDomains
    };
  });

  return NextResponse.json({
    project,
    run: {
      id: data.runId,
      generatedAt: data.generatedAt,
      topResults: data.topResults,
      minDemand: data.minDemand
    },
    clusters
  });
}
