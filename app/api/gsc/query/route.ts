import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { searchAnalyticsQuery } from "@/lib/gsc";
import { authOptions } from "@/lib/auth";
import { resolveUserSiteAccess } from "@/lib/gsc-access";

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

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    body = bodySchema.parse(json);
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const preferredAccountId = cookies().get("accountId")?.value;

  try {
    const access = await resolveUserSiteAccess(userId, body.siteUrl, preferredAccountId);
    const rows = await searchAnalyticsQuery(access.accessToken, body.siteUrl, {
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

    if (process.env.NODE_ENV !== "production") {
      console.info("[GSC][query] success", {
        userId,
        accountId: access.accountId,
        email: access.accountEmail,
        siteUrl: body.siteUrl,
        rowCount: rows.length
      });
    }
    return NextResponse.json({ rows }, { status: 200 });
  } catch (err: any) {
    const message = err?.message ?? "Server error";
    const invalidGrant = /invalid_grant|token revoked|token_expired/i.test(message);
    const missingRefreshToken = err?.code === "missing_refresh_token";
    const siteNotFound = err?.code === "site_not_found";
    if (process.env.NODE_ENV !== "production") {
      console.error("[GSC][query] error", {
        userId,
        preferredAccountId,
        siteUrl: body.siteUrl,
        message
      });
    }
    if (missingRefreshToken) {
      return NextResponse.json({ error: message, code: "missing_refresh_token" }, { status: 401 });
    }
    if (siteNotFound) {
      return NextResponse.json({ error: message, code: "site_not_found" }, { status: 404 });
    }
    if (invalidGrant) {
      return NextResponse.json({ error: message, code: "refresh_invalid" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
