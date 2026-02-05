import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { SessionProviderWrapper } from "@/components/providers/session-provider";

export const metadata: Metadata = {
  title: "GSC Dashboard",
  description: "Google Search Console Dashboard (MVP)"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
