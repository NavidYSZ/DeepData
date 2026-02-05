"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  email: string | null;
  created_at: string;
}

interface AccountsResponse {
  accounts: Account[];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch error");
  return res.json();
};

type RenderButton = (args: { current?: Account; open: boolean }) => React.ReactNode;

interface AccountMenuProps {
  renderButton?: RenderButton;
  className?: string;
}

export function AccountMenu({ renderButton, className }: AccountMenuProps) {
  const { data, mutate } = useSWR<AccountsResponse>("/api/accounts", fetcher);
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  const accounts = data?.accounts ?? [];

  async function selectAccount(id: string) {
    setSelecting(id);
    try {
      await fetch("/api/accounts/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id })
      });
      await mutate();
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setSelecting(null);
    }
  }

  // choose the first account as current heuristic (cookie is server-side; we display first)
  const current = accounts[0];

  useEffect(() => {
    const handle = () => setOpen(false);
    window.addEventListener("click", handle);
    return () => window.removeEventListener("click", handle);
  }, []);

  const buttonContent =
    renderButton?.({ current, open }) ??
    (
      <Button
        variant="secondary"
        size="sm"
        className="min-w-[180px] justify-between"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="truncate text-left">
          {current?.email ?? "Account auswählen"}
        </span>
        <span className="text-xs text-muted-foreground">▼</span>
      </Button>
    );

  return (
    <div className={cn("relative", className)}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {buttonContent}
      </div>

      {open && (
        <Card
          className="absolute left-0 z-30 mt-2 w-72 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <CardContent className="space-y-2 py-3">
            <p className="text-xs font-semibold text-muted-foreground">Konten</p>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                className={cn(
                  "w-full rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-muted",
                  selecting === acc.id && "opacity-60"
                )}
                onClick={() => selectAccount(acc.id)}
                disabled={!!selecting}
              >
                {acc.email ?? "Ohne E-Mail"}{" "}
                <span className="text-[11px] text-muted-foreground">({acc.id.slice(0, 6)})</span>
              </button>
            ))}

            <div className="pt-2 border-t border-border/80">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  window.location.href = "/api/auth/google";
                }}
              >
                Weiteren Nutzer hinzufügen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
