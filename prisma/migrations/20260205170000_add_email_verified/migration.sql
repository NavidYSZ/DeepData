-- Add emailVerified column for NextAuth compatibility
ALTER TABLE "User" ADD COLUMN "emailVerified" DATETIME;
