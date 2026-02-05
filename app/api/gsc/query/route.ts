import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshAccessToken } from "@/lib/google-oauth";
import { searchAnalyticsQuery } from "@/lib/gsc";
import { authOptions } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

const filterSchema = z.object({
  dimension: z.string(),
  operator: z.string(),
  expression: z.string()
});

const bodySchema = z.object({
  siteUrl: z.string().min(1),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  dimensions: z.array(z.string()).min(1),
  rowLimit: z.number().optional(),
  pageSize: z.number().optional(),
  startRow: z.number().optional(),
  filters: z.array(filterSchema).optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const cookieStore = cookies();
  const accountId = cookieStore.get("accountId")?.value;
  const account = accountId
    ? await prisma.gscAccount.findFirst({ where: { id: accountId, userId } })
    : await prisma.gscAccount.findFirst({ where: { userId }, orderBy: { created_at: "asc" } });

  if (!account?.refresh_token) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    body = bodySchema.parse(json);
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessToken(decrypt(account.refresh_token));
    const rows = await searchAnalyticsQuery(tokens.access_token, body.siteUrl, {
      startDate: body.startDate,
      endDate: body.endDate,
      dimensions: body.dimensions,
      rowLimit: body.pageSize ?? body.rowLimit,
      startRow: body.startRow,
      dimensionFilterGroups: body.filters
        ? [
            {
              // allow multiple filters (e.g., many queries) to match with OR for rank-tracker use case
              groupType: body.filters.length > 1 ? "or" : "and",
              filters: body.filters.map((f) => ({
                dimension: f.dimension,
                operator: f.operator,
                expression: f.expression
              }))
            }
          ]
        : undefined
    });

    return NextResponse.json({ rows }, { status: 200 });
  } catch (err: any) {
    console.error("GSC query error", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
