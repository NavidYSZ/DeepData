-- DropIndex
DROP INDEX "ChatFile_sessionId_idx";

-- DropIndex
DROP INDEX "ChatMessage_sessionId_idx";

-- CreateTable
CREATE TABLE "KeywordProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'de',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "gscSiteUrl" TEXT,
    "gscDefaultDays" INTEGER NOT NULL DEFAULT 28,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeywordProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeywordSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kwRaw" TEXT NOT NULL,
    "kwNorm" TEXT NOT NULL,
    "kwSig" TEXT NOT NULL,
    "lang" TEXT,
    "country" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Keyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordSourceMetric" (
    "keywordId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "position" REAL,
    "sistrixVolume" INTEGER,
    "cpc" REAL,
    "kd" REAL,
    "url" TEXT,
    "dateFrom" DATETIME,
    "dateTo" DATETIME,

    PRIMARY KEY ("keywordId", "sourceId"),
    CONSTRAINT "KeywordSourceMetric_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeywordSourceMetric_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KeywordSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordDemand" (
    "keywordId" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "demandMonthly" REAL NOT NULL,
    "demandSource" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeywordDemand_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeywordDemand_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Precluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "algoVersion" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "totalDemand" REAL NOT NULL,
    "cohesion" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Precluster_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PreclusterMember" (
    "preclusterId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "score" REAL NOT NULL,

    PRIMARY KEY ("preclusterId", "keywordId"),
    CONSTRAINT "PreclusterMember_preclusterId_fkey" FOREIGN KEY ("preclusterId") REFERENCES "Precluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreclusterMember_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cluster_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClusterMember" (
    "clusterId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,

    PRIMARY KEY ("clusterId", "keywordId"),
    CONSTRAINT "ClusterMember_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClusterMember_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Neue Unterhaltung',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatSession" ("archived", "createdAt", "id", "title", "updatedAt", "userId") SELECT "archived", "createdAt", "id", "title", "updatedAt", "userId" FROM "ChatSession";
DROP TABLE "ChatSession";
ALTER TABLE "new_ChatSession" RENAME TO "ChatSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KeywordSource_projectId_type_idx" ON "KeywordSource"("projectId", "type");

-- CreateIndex
CREATE INDEX "Keyword_projectId_kwNorm_idx" ON "Keyword"("projectId", "kwNorm");

-- CreateIndex
CREATE INDEX "Keyword_projectId_kwSig_idx" ON "Keyword"("projectId", "kwSig");

-- CreateIndex
CREATE INDEX "KeywordDemand_projectId_demandMonthly_idx" ON "KeywordDemand"("projectId", "demandMonthly");

-- CreateIndex
CREATE INDEX "Precluster_projectId_totalDemand_idx" ON "Precluster"("projectId", "totalDemand");

-- CreateIndex
CREATE INDEX "PreclusterMember_keywordId_idx" ON "PreclusterMember"("keywordId");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_projectId_createdAt_idx" ON "WorkspaceEvent"("projectId", "createdAt");

