"use client";

import { Info, Layers, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { humanizePredicate, relationsForEntity } from "@/lib/entity-graph/transform";
import type {
  EntityGraphEntity,
  EntityGraphRelation
} from "@/lib/entity-graph/types";

export function EntityDetailPanel({
  entity,
  color,
  relations,
  onSelectEntity
}: {
  entity: EntityGraphEntity;
  color: string;
  relations: EntityGraphRelation[];
  onSelectEntity: (canonicalName: string) => void;
}) {
  const { outgoing, incoming } = relationsForEntity(entity.canonical_name, relations);

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {entity.category}
          </span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {entity.semantic_role}
          </Badge>
          <Badge variant="secondary" className="text-[11px]">
            {entity.mentions}× erwähnt
          </Badge>
        </div>
        {entity.name !== entity.canonical_name ? (
          <div className="text-xs text-muted-foreground">
            Im Text als <span className="font-medium text-foreground">&ldquo;{entity.name}&rdquo;</span>
          </div>
        ) : null}
      </div>

      {entity.definition_in_text ? (
        <Block icon={<Info className="h-3.5 w-3.5" />} label="Definition im Text">
          <p className="text-sm italic text-muted-foreground">&ldquo;{entity.definition_in_text}&rdquo;</p>
        </Block>
      ) : null}

      <Block
        icon={<Layers className="h-3.5 w-3.5" />}
        label={`Ausgehende Relationen (${outgoing.length})`}
      >
        {outgoing.length ? (
          <ul className="space-y-2">
            {outgoing.map((r, i) => (
              <RelationRow
                key={`out-${i}`}
                direction="out"
                relation={r}
                otherName={r.object}
                onSelectEntity={onSelectEntity}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">keine</p>
        )}
      </Block>

      <Block
        icon={<Layers className="h-3.5 w-3.5 -scale-x-100" />}
        label={`Eingehende Relationen (${incoming.length})`}
      >
        {incoming.length ? (
          <ul className="space-y-2">
            {incoming.map((r, i) => (
              <RelationRow
                key={`in-${i}`}
                direction="in"
                relation={r}
                otherName={r.subject}
                onSelectEntity={onSelectEntity}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">keine</p>
        )}
      </Block>
    </div>
  );
}

function RelationRow({
  direction,
  relation,
  otherName,
  onSelectEntity
}: {
  direction: "in" | "out";
  relation: EntityGraphRelation;
  otherName: string;
  onSelectEntity: (canonicalName: string) => void;
}) {
  return (
    <li className="rounded-md border bg-background/50 p-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
          {humanizePredicate(relation.predicate)}
        </span>
        <span className="text-muted-foreground">{direction === "out" ? "→" : "←"}</span>
        <button
          type="button"
          onClick={() => onSelectEntity(otherName)}
          className="truncate font-medium text-foreground underline-offset-2 hover:underline"
        >
          {otherName}
        </button>
      </div>
      {relation.evidence ? (
        <div className="mt-1.5 flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-3 italic">{relation.evidence}</span>
        </div>
      ) : null}
    </li>
  );
}

function Block({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
