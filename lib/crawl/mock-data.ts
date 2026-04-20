export type CrawlChangeType = "new" | "updated" | "removed" | "issue";

export interface CrawlOverview {
  trackedPages: number;
  changedToday: number;
  openIssues: number;
  lastRunAt: string;
  nextRunAt: string;
}

export interface CrawlRunSummary {
  id: string;
  label: string;
  status: "completed" | "scheduled";
  startedAt: string;
  finishedAt?: string;
  totalUrls: number;
  changedUrls: number;
  issueCount: number;
}

export interface CrawlUrlRow {
  id: string;
  url: string;
  statusCode: number;
  title: string;
  canonical: string;
  depth: number;
  indexability: "indexable" | "noindex";
  issueCount: number;
  changeType: CrawlChangeType | "unchanged";
}

export interface CrawlChangeEntry {
  id: string;
  date: string;
  timestamp: string;
  url: string;
  type: CrawlChangeType;
  field: string;
  before: string;
  after: string;
  note: string;
}

// These shapes mirror the likely persistence model for the real crawler:
// crawl run -> URL snapshot -> change event.
export const crawlOverview: CrawlOverview = {
  trackedPages: 1248,
  changedToday: 37,
  openIssues: 12,
  lastRunAt: "2026-04-17T04:10:00.000Z",
  nextRunAt: "2026-04-18T04:00:00.000Z"
};

export const crawlRuns: CrawlRunSummary[] = [
  {
    id: "run-104",
    label: "Daily Crawl 104",
    status: "completed",
    startedAt: "2026-04-17T04:10:00.000Z",
    finishedAt: "2026-04-17T04:24:00.000Z",
    totalUrls: 1248,
    changedUrls: 37,
    issueCount: 12
  },
  {
    id: "run-103",
    label: "Daily Crawl 103",
    status: "completed",
    startedAt: "2026-04-16T04:08:00.000Z",
    finishedAt: "2026-04-16T04:21:00.000Z",
    totalUrls: 1242,
    changedUrls: 19,
    issueCount: 9
  },
  {
    id: "run-102",
    label: "Daily Crawl 102",
    status: "completed",
    startedAt: "2026-04-15T04:09:00.000Z",
    finishedAt: "2026-04-15T04:22:00.000Z",
    totalUrls: 1238,
    changedUrls: 8,
    issueCount: 7
  },
  {
    id: "run-105",
    label: "Daily Crawl 105",
    status: "scheduled",
    startedAt: "2026-04-18T04:00:00.000Z",
    totalUrls: 0,
    changedUrls: 0,
    issueCount: 0
  }
];

export const crawlerRows: CrawlUrlRow[] = [
  {
    id: "url-1",
    url: "https://example.com/",
    statusCode: 200,
    title: "DeepData | SEO Intelligence Platform",
    canonical: "https://example.com/",
    depth: 0,
    indexability: "indexable",
    issueCount: 0,
    changeType: "updated"
  },
  {
    id: "url-2",
    url: "https://example.com/features",
    statusCode: 200,
    title: "Features | Crawl, Rank Tracking & Changes",
    canonical: "https://example.com/features",
    depth: 1,
    indexability: "indexable",
    issueCount: 1,
    changeType: "updated"
  },
  {
    id: "url-3",
    url: "https://example.com/pricing",
    statusCode: 200,
    title: "Pricing | DeepData",
    canonical: "https://example.com/pricing",
    depth: 1,
    indexability: "indexable",
    issueCount: 0,
    changeType: "unchanged"
  },
  {
    id: "url-4",
    url: "https://example.com/blog/website-migrations",
    statusCode: 200,
    title: "Website Migrations Checklist",
    canonical: "https://example.com/blog/website-migrations",
    depth: 2,
    indexability: "indexable",
    issueCount: 2,
    changeType: "issue"
  },
  {
    id: "url-5",
    url: "https://example.com/changelog",
    statusCode: 200,
    title: "Product Changelog",
    canonical: "https://example.com/changelog",
    depth: 1,
    indexability: "indexable",
    issueCount: 0,
    changeType: "new"
  },
  {
    id: "url-6",
    url: "https://example.com/old-landing-page",
    statusCode: 301,
    title: "Old Landing Page",
    canonical: "https://example.com/landing",
    depth: 2,
    indexability: "noindex",
    issueCount: 1,
    changeType: "removed"
  },
  {
    id: "url-7",
    url: "https://example.com/academy/internal-linking",
    statusCode: 200,
    title: "Internal Linking for SEO Teams",
    canonical: "https://example.com/academy/internal-linking",
    depth: 3,
    indexability: "indexable",
    issueCount: 0,
    changeType: "updated"
  },
  {
    id: "url-8",
    url: "https://example.com/contact",
    statusCode: 404,
    title: "Contact",
    canonical: "https://example.com/contact",
    depth: 1,
    indexability: "noindex",
    issueCount: 1,
    changeType: "issue"
  }
];

export const crawlChangeEntries: CrawlChangeEntry[] = [
  {
    id: "change-1",
    date: "2026-04-17",
    timestamp: "2026-04-17T04:12:00.000Z",
    url: "https://example.com/",
    type: "updated",
    field: "Title",
    before: "DeepData | Technical SEO Suite",
    after: "DeepData | SEO Intelligence Platform",
    note: "Homepage messaging wurde auf Platform statt Suite geändert."
  },
  {
    id: "change-2",
    date: "2026-04-17",
    timestamp: "2026-04-17T04:14:00.000Z",
    url: "https://example.com/changelog",
    type: "new",
    field: "URL",
    before: "Nicht vorhanden",
    after: "Indexierbar, Status 200",
    note: "Neue Seite wurde beim Daily Crawl entdeckt."
  },
  {
    id: "change-3",
    date: "2026-04-17",
    timestamp: "2026-04-17T04:18:00.000Z",
    url: "https://example.com/contact",
    type: "issue",
    field: "Status",
    before: "200 OK",
    after: "404 Not Found",
    note: "Seite liefert jetzt einen Fehlercode und muss geprüft werden."
  },
  {
    id: "change-4",
    date: "2026-04-16",
    timestamp: "2026-04-16T04:12:00.000Z",
    url: "https://example.com/features",
    type: "updated",
    field: "Meta Description",
    before: "Track rankings and pages in one dashboard.",
    after: "Track rankings, crawl changes and technical issues in one dashboard.",
    note: "Beschreibung erweitert um Crawl-Use-Case."
  },
  {
    id: "change-5",
    date: "2026-04-16",
    timestamp: "2026-04-16T04:16:00.000Z",
    url: "https://example.com/old-landing-page",
    type: "removed",
    field: "Canonical",
    before: "Self canonical",
    after: "301 -> /landing",
    note: "Landingpage wurde in den Redirect-Flow verschoben."
  },
  {
    id: "change-6",
    date: "2026-04-14",
    timestamp: "2026-04-14T04:11:00.000Z",
    url: "https://example.com/academy/internal-linking",
    type: "updated",
    field: "Internal Links",
    before: "12 interne Links",
    after: "21 interne Links",
    note: "Artikel wurde stärker ins Hub eingebunden."
  },
  {
    id: "change-7",
    date: "2026-04-11",
    timestamp: "2026-04-11T04:19:00.000Z",
    url: "https://example.com/blog/website-migrations",
    type: "issue",
    field: "H1",
    before: "Website Migration Checklist",
    after: "Leer",
    note: "Crawler hat eine fehlende Hauptüberschrift erkannt."
  }
];
