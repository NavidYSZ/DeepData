import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-semibold">GSC Dashboard</h1>
        <p className="text-muted">
          Starte das Dashboard, verbinde Google und lade Search Console Daten.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
