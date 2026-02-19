/* eslint-disable @next/next/no-img-element */
"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  lang: string;
  country: string;
  gscSiteUrl?: string | null;
  gscDefaultDays: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectsResponse = {
  items: Project[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function KeywordWorkspaceProjects() {
  const router = useRouter();
  const { data, mutate } = useSWR<ProjectsResponse>("/api/keyword-workspace/projects", (url: string) =>
    fetchJson<ProjectsResponse>(url)
  );
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gscSiteUrl: "",
    lang: "de",
    country: "DE",
    gscDefaultDays: 28
  });

  const projects: Project[] = data?.items ?? [];

  async function createProject() {
    setCreating(true);
    const res = await fetch("/api/keyword-workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    setCreating(false);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Fehler beim Erstellen");
      return;
    }
    const proj = await res.json();
    mutate();
    router.push(`/keyword-workspace/${proj.id}/setup`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Keyword Workspace</h1>
        <div className="flex gap-2">
          <Button onClick={() => createProject()} disabled={creating || !form.name}>
            Neues Projekt
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projekt anlegen</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Projektname</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>GSC Property</Label>
            <Input value={form.gscSiteUrl} onChange={(e) => setForm({ ...form, gscSiteUrl: e.target.value })} />
          </div>
          <div>
            <Label>Sprache</Label>
            <Input value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} />
          </div>
          <div>
            <Label>Land</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div>
            <Label>GSC Zeitraum (Tage)</Label>
            <Input
              type="number"
              value={form.gscDefaultDays}
              onChange={(e) => setForm({ ...form, gscDefaultDays: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="grid gap-4 md:grid-cols-3">
        {projects.map((project) => (
          <Card
            key={project.id}
            className="cursor-pointer transition hover:border-primary"
            onClick={() => router.push(`/keyword-workspace/${project.id}/cards`)}
          >
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project.lang}-{project.country} · {project.gscSiteUrl || "ohne GSC"}
              </p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Erstellt {new Date(project.createdAt).toLocaleDateString()}
            </CardContent>
          </Card>
        ))}
        {projects.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Projekte.</p>}
      </div>
    </div>
  );
}
