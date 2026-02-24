-- Add new run-level settings and counters
ALTER TABLE "SerpClusterRun" ADD COLUMN "topResults" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "SerpClusterRun" ADD COLUMN "clusterAlgorithm" TEXT NOT NULL DEFAULT 'louvain';
ALTER TABLE "SerpClusterRun" ADD COLUMN "snapshotReuseMode" TEXT NOT NULL DEFAULT 'reuse_any_fetch_missing';
ALTER TABLE "SerpClusterRun" ADD COLUMN "missingSnapshotCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SerpClusterRun" ADD COLUMN "fetchedMissingCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows with defaults (SQLite defaults already applied to new columns)
UPDATE "SerpClusterRun"
SET
  "topResults" = COALESCE("topResults", 10),
  "clusterAlgorithm" = COALESCE("clusterAlgorithm", 'louvain'),
  "snapshotReuseMode" = COALESCE("snapshotReuseMode", 'reuse_any_fetch_missing'),
  "missingSnapshotCount" = COALESCE("missingSnapshotCount", 0),
  "fetchedMissingCount" = COALESCE("fetchedMissingCount", 0);
