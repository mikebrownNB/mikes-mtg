"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ManaCurve } from "@/components/mana-curve";
import {
  DeckCollectionPane,
  type CollectionPaneItem,
} from "@/components/deck-collection-pane";
import { FORMATS, hasCommanderZone, targetSizeFor } from "@/lib/formats";

type LegalitiesMap = Record<string, string>;

type CardData = {
  id: string;
  name: string;
  set_code: string | null;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  rarity: string | null;
  image_uris: Record<string, string> | null;
  layout: string | null;
  raw: { legalities?: LegalitiesMap } | null;
};

export type DeckBuilderDeck = {
  id: string;
  name: string;
  format: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type DeckCardRow = {
  id: string;
  quantity: number;
  zone: Zone;
  card_id: string;
  cards: CardData | CardData[] | null;
};

const ZONES = ["mainboard", "sideboard", "commander", "maybeboard"] as const;
type Zone = (typeof ZONES)[number];

const ZONE_LABELS: Record<Zone, string> = {
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  commander: "Commander",
  maybeboard: "Maybeboard",
};

const TYPE_ORDER = [
  "Creature",
  "Planeswalker",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
  "Other",
] as const;
type CardType = (typeof TYPE_ORDER)[number];

function primaryType(typeLine: string | null | undefined): CardType {
  const tl = (typeLine ?? "").toLowerCase();
  for (const t of TYPE_ORDER) {
    if (tl.includes(t.toLowerCase())) return t;
  }
  return "Other";
}

function getCard(row: DeckCardRow): CardData | null {
  return Array.isArray(row.cards) ? row.cards[0] ?? null : row.cards;
}

function legalityStatus(
  card: CardData | null,
  format: string | null,
): { status: string; cls: string } | null {
  if (!card || !format) return null;
  const status = card.raw?.legalities?.[format];
  if (!status) return null;
  switch (status) {
    case "legal":
      return { status, cls: "bg-emerald-500" };
    case "restricted":
      return { status, cls: "bg-amber-400" };
    case "banned":
      return { status, cls: "bg-red-500" };
    case "not_legal":
    default:
      return { status, cls: "bg-neutral-600" };
  }
}

// Drag payload shapes — kept as discriminated unions so onDragEnd can route.
type DragKind =
  | {
      kind: "collection";
      cardId: string;
      name: string;
      image: string | null;
    }
  | {
      kind: "deck-card";
      deckCardId: string;
      currentZone: Zone;
      name: string;
      image: string | null;
    };

// ---------------------------------------------------------------------------
// Top-level builder (DndContext lives here)
// ---------------------------------------------------------------------------

export function DeckBuilder({
  deck,
  cards,
  collection,
}: {
  deck: DeckBuilderDeck;
  cards: DeckCardRow[];
  collection: CollectionPaneItem[];
}) {
  const router = useRouter();
  const [activeZone, setActiveZone] = useState<Zone>("mainboard");
  const [showExport, setShowExport] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragKind | null>(null);
  const [dndError, setDndError] = useState<string | null>(null);

  // Mouse only — touch users keep the existing tap UX.
  // distance:8 means a click won't accidentally start a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const showCommanderTab = hasCommanderZone(deck.format);
  const visibleZones = useMemo<Zone[]>(
    () => ZONES.filter((z) => z !== "commander" || showCommanderTab),
    [showCommanderTab],
  );

  useEffect(() => {
    if (!visibleZones.includes(activeZone)) setActiveZone("mainboard");
  }, [activeZone, visibleZones]);

  const cardsByZone = useMemo(() => {
    const map: Record<Zone, DeckCardRow[]> = {
      mainboard: [],
      sideboard: [],
      commander: [],
      maybeboard: [],
    };
    for (const row of cards) {
      if (ZONES.includes(row.zone)) map[row.zone].push(row);
    }
    return map;
  }, [cards]);

  const zoneCounts: Record<Zone, number> = {
    mainboard: 0,
    sideboard: 0,
    commander: 0,
    maybeboard: 0,
  };
  for (const z of ZONES) {
    zoneCounts[z] = cardsByZone[z].reduce((s, r) => s + r.quantity, 0);
  }

  const target = targetSizeFor(deck.format);
  const mainCount = zoneCounts.mainboard + zoneCounts.commander;
  const mainTargetClass =
    target === null
      ? "text-neutral-300"
      : mainCount < target
        ? "text-amber-400"
        : "text-emerald-400";

  const curveSource = useMemo(() => {
    return cardsByZone.mainboard
      .map((r) => {
        const c = getCard(r);
        return c
          ? { cmc: c.cmc, type_line: c.type_line, quantity: r.quantity }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cardsByZone]);

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as DragKind | undefined;
    if (data) setActiveDrag(data);
    setDndError(null);
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;

    const activeData = active.data.current as DragKind | undefined;
    const overData = over.data.current as { kind: "zone"; zone: Zone } | undefined;
    if (!activeData || overData?.kind !== "zone") return;

    const targetZone = overData.zone;

    try {
      if (activeData.kind === "collection") {
        const res = await fetch(`/api/decks/${deck.id}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card_id: activeData.cardId,
            zone: targetZone,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setDndError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        setActiveZone(targetZone);
        router.refresh();
      } else if (activeData.kind === "deck-card") {
        if (activeData.currentZone === targetZone) return;
        const res = await fetch(`/api/deck-cards/${activeData.deckCardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zone: targetZone }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setDndError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        setActiveZone(targetZone);
        router.refresh();
      }
    } catch (err) {
      setDndError(err instanceof Error ? err.message : "drag failed");
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:gap-6">
        <DeckCollectionPane items={collection} />

        <div className="flex min-w-0 flex-col gap-4">
          <DeckHeader
            deck={deck}
            onChanged={() => router.refresh()}
            onDeleted={() => router.push("/decks")}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
            <span>
              Mainboard{" "}
              <span className={mainTargetClass}>
                {mainCount}
                {target ? ` / ${target}` : ""}
              </span>
            </span>
            {showCommanderTab && (
              <span>
                Commander{" "}
                <span className="text-neutral-200">{zoneCounts.commander}</span>
              </span>
            )}
            <span>
              Sideboard{" "}
              <span className="text-neutral-200">{zoneCounts.sideboard}</span>
            </span>
            <span>
              Maybeboard{" "}
              <span className="text-neutral-200">{zoneCounts.maybeboard}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowExport((v) => !v)}
              className="ml-auto rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              {showExport ? "Hide export" : "Export"}
            </button>
          </div>

          {showExport && (
            <ExportPanel
              deck={deck}
              cardsByZone={cardsByZone}
              showCommander={showCommanderTab}
            />
          )}

          <ManaCurve cards={curveSource} />

          <AddCardSearch
            deckId={deck.id}
            zone={activeZone}
            onAdded={() => router.refresh()}
          />

          <div className="flex gap-1 overflow-x-auto rounded-md bg-neutral-900 p-1 text-xs">
            {visibleZones.map((z) => (
              <ZoneTab
                key={z}
                zone={z}
                label={ZONE_LABELS[z]}
                count={zoneCounts[z]}
                active={activeZone === z}
                draggingNow={activeDrag !== null}
                onClick={() => setActiveZone(z)}
              />
            ))}
          </div>

          {dndError && (
            <p className="text-xs text-red-400">Drop failed: {dndError}</p>
          )}

          <ZoneCardList
            cards={cardsByZone[activeZone]}
            deckFormat={deck.format}
            showCommanderTab={showCommanderTab}
            onChanged={() => router.refresh()}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="pointer-events-none flex items-center gap-2 rounded border border-emerald-500 bg-neutral-900/95 p-1.5 shadow-2xl shadow-emerald-900/50">
            {activeDrag.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={activeDrag.image}
                alt=""
                className="h-12 w-9 flex-shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-12 w-9 flex-shrink-0 rounded bg-neutral-800" />
            )}
            <span className="pr-2 text-xs font-medium text-neutral-100">
              {activeDrag.name}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Zone tab (acts as both a tab button AND a drop target on desktop)
// ---------------------------------------------------------------------------

function ZoneTab({
  zone,
  label,
  count,
  active,
  draggingNow,
  onClick,
}: {
  zone: Zone;
  label: string;
  count: number;
  active: boolean;
  draggingNow: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone-${zone}`,
    data: { kind: "zone", zone },
  });

  // While a drag is in progress, give the tab a stronger affordance so the
  // user can see it as a drop target.
  const dropHint = draggingNow
    ? isOver
      ? "ring-2 ring-emerald-500 bg-emerald-900/30"
      : "ring-1 ring-neutral-700"
    : "";

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`flex-1 whitespace-nowrap rounded px-3 py-1.5 transition ${
        active
          ? "bg-neutral-800 text-neutral-100"
          : "text-neutral-400 hover:text-neutral-200"
      } ${dropHint}`}
    >
      {label}
      <span className="ml-1.5 text-neutral-500">{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Header (inline-edit name / format / description / delete)
// ---------------------------------------------------------------------------

function DeckHeader({
  deck,
  onChanged,
  onDeleted,
}: {
  deck: DeckBuilderDeck;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deck.name);
  const [format, setFormat] = useState<string>(deck.format ?? "");
  const [description, setDescription] = useState(deck.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          format: format || null,
          description: description || null,
        }),
      });
      const json = (await res.json()) as { ok?: true; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        setConfirmDelete(false);
        return;
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {deck.name}
            </h1>
            <p className="text-xs text-neutral-500">
              {deck.format ?? "no format"}
              {deck.description ? ` · ${deck.description}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Edit
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <input
        type="text"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
      />
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-emerald-600 focus:outline-none"
      >
        <option value="">No format</option>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <textarea
        rows={2}
        maxLength={1000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (confirmDelete) void remove();
            else {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 3000);
            }
          }}
          disabled={saving}
          className={`rounded px-3 py-1.5 text-xs transition ${
            confirmDelete
              ? "bg-red-600 text-white"
              : "border border-red-800 text-red-400 hover:bg-red-950"
          } disabled:opacity-50`}
        >
          {confirmDelete ? "Tap again to delete deck" : "Delete deck"}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(deck.name);
              setFormat(deck.format ?? "");
              setDescription(deck.description ?? "");
              setError(null);
            }}
            disabled={saving}
            className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add card (Scryfall autocomplete → POST /api/decks/[id]/cards)
// ---------------------------------------------------------------------------

function AddCardSearch({
  deckId,
  zone,
  onAdded,
}: {
  deckId: string;
  zone: Zone;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(trimmed)}`,
        );
        const json = (await res.json()) as { data?: string[] };
        setResults(json.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function add(name: string) {
    setAdding(name);
    setFeedback(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, zone }),
      });
      const json = (await res.json()) as
        | { ok: true; action: string; quantity: number }
        | { error: string };
      if (!res.ok || "error" in json) {
        setFeedback({
          kind: "err",
          text: "error" in json ? json.error : `HTTP ${res.status}`,
        });
        return;
      }
      setFeedback({
        kind: "ok",
        text:
          json.action === "incremented"
            ? `${name} → ×${json.quantity}`
            : `Added ${name} to ${ZONE_LABELS[zone]}`,
      });
      setQuery("");
      setResults([]);
      onAdded();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "add failed",
      });
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-neutral-400">
        Add card to{" "}
        <span className="text-neutral-200">{ZONE_LABELS[zone]}</span>
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Scryfall…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
      />
      {loading && <p className="text-xs text-neutral-500">Searching…</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          {results.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => add(name)}
                disabled={adding !== null}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800 disabled:opacity-50"
              >
                <span className="truncate">{name}</span>
                <span className="ml-3 flex-shrink-0 text-xs text-neutral-500">
                  {adding === name ? "Adding…" : "Add +"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {feedback && (
        <p
          className={
            feedback.kind === "ok"
              ? "text-xs text-emerald-400"
              : "text-xs text-red-400"
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone card list (grouped by primary card type, with inline edit per row)
// ---------------------------------------------------------------------------

function ZoneCardList({
  cards,
  deckFormat,
  showCommanderTab,
  onChanged,
}: {
  cards: DeckCardRow[];
  deckFormat: string | null;
  showCommanderTab: boolean;
  onChanged: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<CardType, DeckCardRow[]>();
    for (const row of cards) {
      const c = getCard(row);
      const t = primaryType(c?.type_line);
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(row);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const ca = getCard(a);
        const cb = getCard(b);
        const cmcDiff = (ca?.cmc ?? 0) - (cb?.cmc ?? 0);
        return cmcDiff !== 0
          ? cmcDiff
          : (ca?.name ?? "").localeCompare(cb?.name ?? "");
      });
    }
    return map;
  }, [cards]);

  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        No cards in this zone yet — add one above
        <span className="hidden lg:inline">
          , or drag from the collection on the left
        </span>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {TYPE_ORDER.filter((t) => grouped.has(t)).map((t) => {
        const rows = grouped.get(t)!;
        const total = rows.reduce((s, r) => s + r.quantity, 0);
        return (
          <div key={t} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {t} ({total})
            </p>
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <DeckCardEntry
                  key={row.id}
                  row={row}
                  deckFormat={deckFormat}
                  showCommanderZone={showCommanderTab}
                  expanded={expandedId === row.id}
                  onToggle={() =>
                    setExpandedId((p) => (p === row.id ? null : row.id))
                  }
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DeckCardEntry({
  row,
  deckFormat,
  showCommanderZone,
  expanded,
  onToggle,
  onChanged,
}: {
  row: DeckCardRow;
  deckFormat: string | null;
  showCommanderZone: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const card = getCard(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Whole-row drag handle. Activation distance:8 keeps it from interfering
  // with the inline +/- buttons or the toggle area.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `deck-card:${row.id}`,
    data: {
      kind: "deck-card",
      deckCardId: row.id,
      currentZone: row.zone,
      name: card?.name ?? "",
      image: card?.image_uris?.small ?? null,
    },
    disabled: !card,
  });

  if (!card) return null;

  const legality = legalityStatus(card, deckFormat);

  async function patch(payload: { quantity?: number; zone?: Zone }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/deck-cards/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: true; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/deck-cards/${row.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: true; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setConfirmDelete(false);
        return;
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  const availableZones: Zone[] = ZONES.filter(
    (z) => z !== "commander" || showCommanderZone,
  );

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`select-none overflow-hidden rounded-md border border-neutral-800 bg-neutral-900/40 transition ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left lg:cursor-grab lg:active:cursor-grabbing"
        >
          {legality && (
            <span
              className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${legality.cls}`}
              title={`${deckFormat}: ${legality.status.replace("_", " ")}`}
              aria-label={`${deckFormat} ${legality.status}`}
            />
          )}
          <span className="text-sm font-medium text-neutral-100">
            {row.quantity}×
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{card.name}</span>
          <span className="hidden flex-shrink-0 text-xs text-neutral-500 sm:inline">
            {card.set_code?.toUpperCase()}
          </span>
        </button>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void patch({ quantity: Math.max(1, row.quantity - 1) });
            }}
            disabled={saving || row.quantity <= 1}
            className="h-7 w-7 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-30"
            aria-label="decrement"
          >
            −
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void patch({ quantity: row.quantity + 1 });
            }}
            disabled={saving}
            className="h-7 w-7 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
            aria-label="increment"
          >
            +
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-800 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              Move to
              <select
                value={row.zone}
                onChange={(e) => void patch({ zone: e.target.value as Zone })}
                disabled={saving}
                className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 focus:border-emerald-600 focus:outline-none"
              >
                {availableZones.map((z) => (
                  <option key={z} value={z}>
                    {ZONE_LABELS[z]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (confirmDelete) void remove();
                else {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                }
              }}
              disabled={saving}
              className={`ml-auto rounded px-2 py-1 text-xs transition ${
                confirmDelete
                  ? "bg-red-600 text-white"
                  : "border border-red-800 text-red-400 hover:bg-red-950"
              } disabled:opacity-50`}
            >
              {confirmDelete ? "Tap to confirm" : "Remove"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          {card.image_uris?.normal && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={card.image_uris.normal}
              alt={card.name}
              className="mx-auto mt-3 w-1/2 rounded-lg shadow-lg"
              loading="lazy"
              draggable={false}
            />
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Export panel
// ---------------------------------------------------------------------------

function ExportPanel({
  deck,
  cardsByZone,
  showCommander,
}: {
  deck: DeckBuilderDeck;
  cardsByZone: Record<Zone, DeckCardRow[]>;
  showCommander: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const lines: string[] = [];

    if (showCommander && cardsByZone.commander.length > 0) {
      lines.push("Commander");
      for (const r of cardsByZone.commander) {
        const c = getCard(r);
        if (c) lines.push(`${r.quantity} ${c.name}`);
      }
      lines.push("");
    }

    if (cardsByZone.mainboard.length > 0) {
      if (showCommander && cardsByZone.commander.length > 0) {
        lines.push("Deck");
      }
      for (const r of cardsByZone.mainboard) {
        const c = getCard(r);
        if (c) lines.push(`${r.quantity} ${c.name}`);
      }
    }

    if (cardsByZone.sideboard.length > 0) {
      lines.push("");
      lines.push("Sideboard");
      for (const r of cardsByZone.sideboard) {
        const c = getCard(r);
        if (c) lines.push(`${r.quantity} ${c.name}`);
      }
    }

    if (cardsByZone.maybeboard.length > 0) {
      lines.push("");
      lines.push("Maybeboard");
      for (const r of cardsByZone.maybeboard) {
        const c = getCard(r);
        if (c) lines.push(`${r.quantity} ${c.name}`);
      }
    }

    return lines.join("\n");
  }, [cardsByZone, showCommander]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; users can still select-and-copy.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">{deck.name} · decklist</p>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto rounded bg-neutral-950 p-2 text-xs text-neutral-200">
{text || "(empty)"}
      </pre>
    </div>
  );
}
