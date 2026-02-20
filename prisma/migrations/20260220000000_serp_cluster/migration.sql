-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GscAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "refresh_token" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "GscAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Neue Unterhaltung',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "toolName" TEXT,
    "toolCallId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "SerpSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zyte',
    "fetchedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "topUrlsJson" TEXT,
    "rawJson" TEXT,
    "hash" TEXT,
    "error" TEXT,
    CONSTRAINT "SerpSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SerpSnapshot_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerpClusterRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "urlOverlapThreshold" REAL NOT NULL DEFAULT 0.3,
    "minDemand" REAL NOT NULL DEFAULT 0,
    "zyteRequested" INTEGER NOT NULL DEFAULT 0,
    "zyteSucceeded" INTEGER NOT NULL DEFAULT 0,
    "zyteCached" INTEGER NOT NULL DEFAULT 0,
    "promptModel" TEXT,
    "error" TEXT,
    CONSTRAINT "SerpClusterRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerpSubcluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalDemand" REAL NOT NULL,
    "keywordCount" INTEGER NOT NULL,
    "overlapScore" REAL,
    "topDomainsJson" TEXT,
    "topUrlsJson" TEXT,
    CONSTRAINT "SerpSubcluster_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SerpClusterRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SerpSubcluster_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerpSubclusterMember" (
    "subclusterId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,

    PRIMARY KEY ("subclusterId", "keywordId"),
    CONSTRAINT "SerpSubclusterMember_subclusterId_fkey" FOREIGN KEY ("subclusterId") REFERENCES "SerpSubcluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SerpSubclusterMember_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerpParentCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rationale" TEXT,
    "totalDemand" REAL NOT NULL,
    "keywordCount" INTEGER NOT NULL,
    "topDomainsJson" TEXT,
    CONSTRAINT "SerpParentCluster_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SerpClusterRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SerpParentCluster_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KeywordProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerpParentToSubcluster" (
    "parentId" TEXT NOT NULL,
    "subclusterId" TEXT NOT NULL,

    PRIMARY KEY ("parentId", "subclusterId"),
    CONSTRAINT "SerpParentToSubcluster_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SerpParentCluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SerpParentToSubcluster_subclusterId_fkey" FOREIGN KEY ("subclusterId") REFERENCES "SerpSubcluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

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

-- CreateIndex
CREATE INDEX "SerpSnapshot_projectId_fetchedAt_idx" ON "SerpSnapshot"("projectId", "fetchedAt");

-- CreateIndex
CREATE INDEX "SerpSnapshot_keywordId_idx" ON "SerpSnapshot"("keywordId");

-- CreateIndex
CREATE INDEX "SerpClusterRun_projectId_startedAt_idx" ON "SerpClusterRun"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "SerpSubcluster_projectId_idx" ON "SerpSubcluster"("projectId");

-- CreateIndex
CREATE INDEX "SerpSubcluster_runId_idx" ON "SerpSubcluster"("runId");

-- CreateIndex
CREATE INDEX "SerpSubclusterMember_keywordId_idx" ON "SerpSubclusterMember"("keywordId");

-- CreateIndex
CREATE INDEX "SerpParentCluster_projectId_idx" ON "SerpParentCluster"("projectId");

-- CreateIndex
CREATE INDEX "SerpParentCluster_runId_idx" ON "SerpParentCluster"("runId");

-- CreateIndex
CREATE INDEX "SerpParentToSubcluster_subclusterId_idx" ON "SerpParentToSubcluster"("subclusterId");

