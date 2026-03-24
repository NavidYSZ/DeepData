import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google-oauth";
import { listSites } from "@/lib/gsc";

type GscAccountRecord = {
  id: string;
  email: string | null;
  refresh_token: string | null;
  created_at: Date;
};

export type UserSiteEntry = {
  siteUrl: string;
  permissionLevel: string;
  accountId: string;
  accountEmail: string | null;
};

type ResolvedUserSiteAccess = UserSiteEntry & {
  accessToken: string;
};

function buildError(message: string, code?: string) {
  const err = new Error(message) as Error & { code?: string };
  if (code) err.code = code;
  return err;
}

function permissionRank(level: string) {
  switch (level) {
    case "siteOwner":
      return 4;
    case "siteFullUser":
      return 3;
    case "siteRestrictedUser":
      return 2;
    case "siteUnverifiedUser":
      return 1;
    default:
      return 0;
  }
}

function sortAccounts(accounts: GscAccountRecord[], preferredAccountId?: string | null) {
  if (!preferredAccountId) return accounts;
  return [...accounts].sort((a, b) => {
    if (a.id === preferredAccountId) return -1;
    if (b.id === preferredAccountId) return 1;
    return a.created_at.getTime() - b.created_at.getTime();
  });
}

async function getOrderedAccounts(userId: string, preferredAccountId?: string | null) {
  const accounts = await prisma.gscAccount.findMany({
    where: { userId },
    orderBy: { created_at: "asc" },
    select: { id: true, email: true, refresh_token: true, created_at: true }
  });
  return sortAccounts(accounts, preferredAccountId);
}

async function refreshTokenForAccount(account: GscAccountRecord) {
  if (!account.refresh_token) {
    throw buildError("Not connected", "missing_refresh_token");
  }
  const tokens = await refreshAccessToken(decrypt(account.refresh_token));
  return tokens.access_token;
}

function shouldReplaceSite(
  existing: UserSiteEntry,
  candidate: UserSiteEntry,
  preferredAccountId?: string | null
) {
  const existingRank = permissionRank(existing.permissionLevel);
  const candidateRank = permissionRank(candidate.permissionLevel);
  if (candidateRank !== existingRank) return candidateRank > existingRank;
  if (candidate.accountId === preferredAccountId && existing.accountId !== preferredAccountId) return true;
  return false;
}

export async function listSitesForUser(userId: string, preferredAccountId?: string | null) {
  const accounts = await getOrderedAccounts(userId, preferredAccountId);
  if (!accounts.length) {
    throw buildError("Not connected", "missing_refresh_token");
  }

  const sitesByUrl = new Map<string, UserSiteEntry>();
  let lastError: unknown = null;
  let hasRefreshableAccount = false;
  let listedAtLeastOneAccount = false;

  for (const account of accounts) {
    if (!account.refresh_token) continue;
    hasRefreshableAccount = true;

    try {
      const accessToken = await refreshTokenForAccount(account);
      const sites = await listSites(accessToken);
      listedAtLeastOneAccount = true;
      for (const site of sites) {
        const candidate: UserSiteEntry = {
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
          accountId: account.id,
          accountEmail: account.email
        };
        const existing = sitesByUrl.get(site.siteUrl);
        if (!existing || shouldReplaceSite(existing, candidate, preferredAccountId)) {
          sitesByUrl.set(site.siteUrl, candidate);
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!hasRefreshableAccount) {
    throw buildError("Not connected", "missing_refresh_token");
  }

  if (!sitesByUrl.size && lastError && !listedAtLeastOneAccount) {
    throw lastError;
  }

  return Array.from(sitesByUrl.values());
}

export async function resolveUserSiteAccess(
  userId: string,
  siteUrl: string,
  preferredAccountId?: string | null
): Promise<ResolvedUserSiteAccess> {
  const accounts = await getOrderedAccounts(userId, preferredAccountId);
  if (!accounts.length) {
    throw buildError("Not connected", "missing_refresh_token");
  }

  let lastError: unknown = null;
  let hasRefreshableAccount = false;
  let listedAtLeastOneAccount = false;

  for (const account of accounts) {
    if (!account.refresh_token) continue;
    hasRefreshableAccount = true;

    try {
      const accessToken = await refreshTokenForAccount(account);
      const sites = await listSites(accessToken);
      listedAtLeastOneAccount = true;
      const match = sites.find((site) => site.siteUrl === siteUrl);
      if (!match) continue;

      return {
        siteUrl: match.siteUrl,
        permissionLevel: match.permissionLevel,
        accountId: account.id,
        accountEmail: account.email,
        accessToken
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!hasRefreshableAccount) {
    throw buildError("Not connected", "missing_refresh_token");
  }

  if (lastError && !listedAtLeastOneAccount) {
    throw lastError;
  }

  throw buildError(`No connected account has access to ${siteUrl}`, "site_not_found");
}

export async function getAccessTokenForUser(
  userId: string,
  options: { siteUrl?: string | null; preferredAccountId?: string | null } = {}
) {
  const { siteUrl, preferredAccountId } = options;
  if (siteUrl) {
    const resolved = await resolveUserSiteAccess(userId, siteUrl, preferredAccountId);
    return resolved.accessToken;
  }

  const accounts = await getOrderedAccounts(userId, preferredAccountId);
  if (!accounts.length) {
    throw buildError("Not connected", "missing_refresh_token");
  }

  let lastError: unknown = null;
  for (const account of accounts) {
    if (!account.refresh_token) continue;
    try {
      return await refreshTokenForAccount(account);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw buildError("Not connected", "missing_refresh_token");
}
