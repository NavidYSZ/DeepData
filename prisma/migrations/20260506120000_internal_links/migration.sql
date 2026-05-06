CREATE TABLE "CrawlRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "siteUrl" TEXT NOT NULL,
  "seedUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "urlsCrawled" INTEGER NOT NULL DEFAULT 0,
  "linksFound" INTEGER NOT NULL DEFAULT 0,
  "maxUrls" INTEGER NOT NULL DEFAULT 500,
  "error" TEXT,
  CONSTRAINT "CrawlRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CrawlRun_userId_startedAt_idx" ON "CrawlRun"("userId", "startedAt");

CREATE TABLE "UrlSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "h1" TEXT,
  "canonical" TEXT,
  "statusCode" INTEGER,
  "indexable" BOOLEAN NOT NULL DEFAULT true,
  "pageType" TEXT NOT NULL DEFAULT 'other',
  "cluster" TEXT NOT NULL DEFAULT 'uncategorised',
  "position" REAL,
  "impressions" INTEGER,
  "clicks" INTEGER,
  CONSTRAINT "UrlSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CrawlRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UrlSnapshot_runId_idx" ON "UrlSnapshot"("runId");
CREATE UNIQUE INDEX "UrlSnapshot_runId_url_key" ON "UrlSnapshot"("runId", "url");

CREATE TABLE "InternalLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "anchorText" TEXT NOT NULL,
  "anchorClass" TEXT NOT NULL,
  "placement" TEXT NOT NULL,
  "isContextual" BOOLEAN NOT NULL DEFAULT false,
  "isNofollow" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "InternalLink_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CrawlRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InternalLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UrlSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InternalLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "UrlSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InternalLink_runId_targetId_idx" ON "InternalLink"("runId", "targetId");
CREATE INDEX "InternalLink_runId_sourceId_idx" ON "InternalLink"("runId", "sourceId");
