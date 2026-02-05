"use client";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { status, data } = useSession();
  const loading = status === "loading";

  if (loading) return <Button variant="secondary" size="sm" disabled>Laden...</Button>;

  if (status === "authenticated") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground truncate max-w-[180px]">{data?.user?.email}</span>
        <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
          Logout
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" onClick={() => signIn("google")}>Login mit Google</Button>
  );
}
