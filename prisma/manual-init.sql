CREATE TABLE IF NOT EXISTS "GoogleAccount" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT,
  "refresh_token" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoogleAccount_email_key" ON "GoogleAccount"("email");
