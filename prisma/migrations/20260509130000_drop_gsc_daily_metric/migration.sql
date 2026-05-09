-- Reverts the previous migration. The persisted-GSC layer was scrapped
-- because the dashboards stayed live-from-GSC; the tables would only have
-- accumulated dead rows.
DROP TABLE IF EXISTS "GscDailyMetric";
DROP TABLE IF EXISTS "GscSyncStatus";
