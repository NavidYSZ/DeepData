interface ListSitesResponse {
  siteEntry: { siteUrl: string; permissionLevel: string }[];
}

interface SearchAnalyticsQueryRequest {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: Array<{
    groupType?: string;
    filters: Array<{
      dimension: string;
      operator: string;
      expression: string;
    }>;
  }>;
}

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
}

export async function listSites(access_token: string) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC sites failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as ListSitesResponse;
  return data.siteEntry ?? [];
}

export async function searchAnalyticsQuery(
  access_token: string,
  siteUrl: string,
  payload: SearchAnalyticsQueryRequest
) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl
  )}/searchAnalytics/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC query failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as SearchAnalyticsResponse;
  return data.rows ?? [];
}
