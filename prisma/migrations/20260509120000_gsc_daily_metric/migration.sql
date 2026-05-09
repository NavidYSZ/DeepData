-- CreateTable
CREATE TABLE "GscDailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "position" REAL NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "GscDailyMetric_userId_siteUrl_date_query_page_key" ON "GscDailyMetric"("userId", "siteUrl", "date", "query", "page");
CREATE INDEX "GscDailyMetric_userId_siteUrl_date_idx" ON "GscDailyMetric"("userId", "siteUrl", "date");
CREATE INDEX "GscDailyMetric_userId_siteUrl_query_idx" ON "GscDailyMetric"("userId", "siteUrl", "query");
CREATE INDEX "GscDailyMetric_userId_siteUrl_page_idx" ON "GscDailyMetric"("userId", "siteUrl", "page");

-- CreateTable
CREATE TABLE "GscSyncStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "lastSyncedDate" TEXT,
    "lastSyncRunAt" DATETIME,
    "lastError" TEXT,
    "earliestSynced" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "GscSyncStatus_userId_siteUrl_key" ON "GscSyncStatus"("userId", "siteUrl");
