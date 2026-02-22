"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useSession, signIn } from "next-auth/react";
import { Check, ChevronDown } from "lucide-react";
import { useSWRConfig } from "swr";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface Account {
  id: string;
  email: string | null;
  created_at: string;
}

interface AccountsResponse {
  accounts: Account[];
  activeAccountId?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch error");
  return res.json();
};

interface AccountMenuProps {
  className?: string;
  compact?: boolean;
}

function truncateLabel(value: string, maxLength = 28) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function AccountMenu({ className, compact = false }: AccountMenuProps) {
  const { status } = useSession();
  const { data, mutate } = useSWR<AccountsResponse>(status === "authenticated" ? "/api/accounts" : null, fetcher);
  const { mutate: mutateGlobal } = useSWRConfig();
  const [selecting, setSelecting] = useState<string | null>(null);

  const accounts = data?.accounts ?? [];
  const activeId = data?.activeAccountId;

  async function selectAccount(id: string) {
    if (id === activeId) return;
    setSelecting(id);
    try {
      const res = await fetch("/api/accounts/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id }),
      });
      if (!res.ok) {
        setSelecting(null);
        return;
      }
    } catch {
      setSelecting(null);
      return;
    }
    try {
      localStorage.removeItem("gsc-site");
    } catch (e) {
      // ignore storage errors (e.g. during SSR)
    }
    mutateGlobal(
      (key: unknown) => Array.isArray(key) && key[0] === "/api/gsc/sites",
      undefined,
      { revalidate: false }
    );
    window.location.reload();
  }

  const current = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const currentEmail = current?.email ?? "Account auswählen";
  const currentEmailShort = truncateLabel(currentEmail);

  useEffect(() => {
    if (!selecting) return;
    const timer = setTimeout(() => setSelecting(null), 1200);
    return () => clearTimeout(timer);
  }, [selecting]);

  return (
    <div className={cn(className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "min-w-0 justify-between overflow-hidden",
              compact ? "h-9 w-[220px] max-w-[70vw]" : "w-full"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback>G</AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate text-left text-sm" title={currentEmail}>
                {currentEmailShort}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start">
          {accounts.map((acc) => (
            <DropdownMenuItem
              key={acc.id}
              onClick={() => selectAccount(acc.id)}
              disabled={!!selecting}
            >
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate">{acc.email ?? "Ohne E-Mail"}</span>
                {acc.id === activeId ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">{acc.id.slice(0, 6)}</span>
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (status !== "authenticated") {
                signIn("google");
              } else {
                window.location.href = "/api/auth/google";
              }
            }}
          >
            Search Console verbinden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
