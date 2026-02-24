ALTER TABLE "SerpClusterRun" ADD COLUMN "eligibleKeywordCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SerpClusterRun" ADD COLUMN "resolvedKeywordCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SerpClusterRun" ADD COLUMN "usedKeywordCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SerpClusterRun" ADD COLUMN "waveCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "SerpClusterRun"
SET
  "eligibleKeywordCount" = COALESCE("eligibleKeywordCount", 0),
  "resolvedKeywordCount" = COALESCE("resolvedKeywordCount", 0),
  "usedKeywordCount" = COALESCE("usedKeywordCount", 0),
  "waveCount" = COALESCE("waveCount", 0);
