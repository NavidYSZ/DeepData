"use client";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { status, data } = useSession();
  const loading = status === "loading";

  if (loading) return <Button variant="secondary" size="sm" disabled className="shrink-0">Laden...</Button>;

  if (status === "authenticated") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground xl:inline">
          {data?.user?.email}
        </span>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => signOut({ callbackUrl: "/" })}>
          Logout
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" className="shrink-0" onClick={() => signIn("google")}>
      <span className="hidden sm:inline">Login mit Google</span>
      <span className="sm:hidden">Login</span>
    </Button>
  );
}
