"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Card = {
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
  prices: Record<string, string | null> | null;
  layout: string | null;
};

export type CollectionItem = {
  id: string;
  quantity: number;
  foil: boolean;
  condition: string | null;
  notes: string | null;
  acquired_at: string;
  cards: Card | Card[] | null;
};

type SortKey = "recent" | "name" | "cmc" | "set" | "value-desc";

const COLOR_FILTERS: { key: string; label: string; cls: string }[] = [
  { key: "W", label: "W", cls: "bg-amber-100 text-amber-900" },
  { key: "U", label: "U", cls: "bg-sky-300 text-sky-950" },
  { key: "B", label: "B", cls: "bg-neutral-300 text-neutral-900" },
  { key: "R", label: "R", cls: "bg-red-300 text-red-950" },
  { key: "G", label: "G", cls: "bg-emerald-300 text-emerald-950" },
  { key: "C", label: "C", cls: "bg-neutral-700 text-neutral-100" },
];

const TYPE_FILTERS = [
  "Creature",
  "Land",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
];

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

function getCard(item: CollectionItem): Card | null {
  return Array.isArray(item.cards) ? item.cards[0] ?? null : item.cards;
}

function unitPriceOf(item: CollectionItem, card: Card | null): number {
  if (!card) return 0;
  const usd = card.prices?.usd;
  const usdFoil = card.prices?.usd_foil;
  const raw = item.foil && usdFoil ? usdFoil : usd;
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function totalPriceOf(item: CollectionItem): number {
  return unitPriceOf(item, getCard(item)) * item.quantity;
}

export function CollectionManager({ items }: { items: CollectionItem[] }) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [colors, setColors] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [foilOnly, setFoilOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const card = getCard(item);
      if (!card) return false;

      if (q && !card.name.toLowerCase().includes(q)) return false;

      if (colors.size > 0) {
        const ci = card.color_identity ?? [];
        const colorlessSelected = colors.has("C");
        const isColorless = ci.length === 0;
        const colorMatch =
          ci.some((c) => colors.has(c)) || (colorlessSelected && isColorless);
        if (!colorMatch) return false;
      }

      if (types.size > 0) {
        const tl = (card.type_line ?? "").toLowerCase();
        if (![...types].some((t) => tl.includes(t.toLowerCase()))) return false;
      }

      if (foilOnly && !item.foil) return false;

      return true;
    });
  }, [items, search, colors, types, foilOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "name":
        arr.sort((a, b) =>
          (getCard(a)?.name ?? "").localeCompare(getCard(b)?.name ?? ""),
        );
        break;
      case "cmc":
        arr.sort((a, b) => {
          const ca = getCard(a);
          const cb = getCard(b);
          const diff = (ca?.cmc ?? 0) - (cb?.cmc ?? 0);
          return diff !== 0
            ? diff
            : (ca?.name ?? "").localeCompare(cb?.name ?? "");
        });
        break;
      case "set":
        arr.sort((a, b) =>
          (getCard(a)?.set_code ?? "").localeCompare(
            getCard(b)?.set_code ?? "",
          ),
        );
        break;
      case "value-desc":
        arr.sort((a, b) => totalPriceOf(b) - totalPriceOf(a));
        break;
      case "recent":
      default:
        // Server already returns ordered by acquired_at desc.
        break;
    }
    return arr;
  }, [filtered, sort]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.quantity, 0);
    const value = filtered.reduce((s, r) => s + totalPriceOf(r), 0);
    return { unique: filtered.length, total, value };
  }, [filtered]);

  const filtersActive =
    search.trim() !== "" ||
    colors.size > 0 ||
    types.size > 0 ||
    foilOnly;

  function toggleSetMember(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
        <span>
          <span className="text-neutral-200">{stats.unique}</span> unique
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="text-neutral-200">{stats.total}</span> total
        </span>
        <span aria-hidden>·</span>
        <span>
          ~<span className="text-neutral-200">${stats.value.toFixed(2)}</span>
        </span>
        {filtersActive && (
          <span className="ml-auto text-neutral-500">filtered view</span>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by name…"
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
      />

      {/* Color row + foil toggle */}
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_FILTERS.map((c) => {
          const on = colors.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setColors(toggleSetMember(colors, c.key))}
              aria-pressed={on}
              className={`h-7 w-7 rounded-full text-xs font-bold ${c.cls} transition ${
                on
                  ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-neutral-950"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {c.label}
            </button>
          );
        })}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={foilOnly}
            onChange={(e) => setFoilOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-600"
          />
          Foil only
        </label>
      </div>

      {/* Type row */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((t) => {
          const on = types.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTypes(toggleSetMember(types, t))}
              aria-pressed={on}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                on
                  ? "bg-emerald-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Sort + clear */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <label className="flex items-center gap-2 text-neutral-400">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-200 focus:border-emerald-600 focus:outline-none"
          >
            <option value="recent">Recently added</option>
            <option value="name">Name</option>
            <option value="cmc">Mana cost</option>
            <option value="set">Set</option>
            <option value="value-desc">Value (high → low)</option>
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setColors(new Set());
              setTypes(new Set());
              setFoilOnly(false);
            }}
            className="text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          {items.length === 0
            ? "No cards yet — go scan or search to add some."
            : "No cards match the filters."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((item) => (
            <CollectionRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === item.id ? null : item.id))
              }
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single row (collapsed summary + expanded edit panel)
// ---------------------------------------------------------------------------

function CollectionRow({
  item,
  expanded,
  onToggle,
  onChanged,
}: {
  item: CollectionItem;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const card = getCard(item);

  // Draft mirrors the server row until the user saves. Reset whenever the
  // panel is closed and reopened (key on item.id keeps this stable).
  const [draft, setDraft] = useState({
    quantity: item.quantity,
    foil: item.foil,
    condition: item.condition,
    notes: item.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!card) return null;
  const img = card.image_uris?.small ?? null;

  // Live value preview while editing.
  const draftValue =
    unitPriceOf({ ...item, ...draft }, card) * draft.quantity;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: draft.quantity,
          foil: draft.foil,
          condition: draft.condition || null,
          notes: draft.notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: true; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged();
      onToggle();
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
      const res = await fetch(`/api/collection/${item.id}`, {
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

  return (
    <li className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900/50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-2 text-left hover:bg-neutral-800/50"
      >
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img}
            alt={card.name}
            loading="lazy"
            className="h-16 w-12 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div className="h-16 w-12 flex-shrink-0 rounded bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {card.name}
            {item.foil && (
              <span className="ml-1 text-xs text-amber-400">✦</span>
            )}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {card.set_code?.toUpperCase()} · {card.type_line ?? ""}
            {item.condition ? ` · ${item.condition}` : ""}
          </p>
        </div>
        <div className="flex-shrink-0 rounded bg-neutral-800 px-2 py-0.5 text-xs">
          ×{item.quantity}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-800 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              Quantity
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      quantity: Math.max(1, d.quantity - 1),
                    }))
                  }
                  className="h-8 w-8 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                  aria-label="decrement"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={draft.quantity}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  className="w-14 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-center text-sm text-neutral-200"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, quantity: d.quantity + 1 }))
                  }
                  className="h-8 w-8 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                  aria-label="increment"
                >
                  +
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              Condition
              <select
                value={draft.condition ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    condition: e.target.value || null,
                  }))
                }
                className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 focus:border-emerald-600 focus:outline-none"
              >
                <option value="">—</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={draft.foil}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, foil: e.target.checked }))
                }
                className="h-4 w-4 accent-emerald-600"
              />
              Foil
            </label>

            <div className="flex flex-col gap-1 text-xs text-neutral-400">
              Value
              <span className="text-sm text-neutral-200">
                ~${draftValue.toFixed(2)}
              </span>
            </div>
          </div>

          <label className="mt-3 flex flex-col gap-1 text-xs text-neutral-400">
            Notes
            <textarea
              value={draft.notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
              rows={2}
              maxLength={1000}
              className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 focus:border-emerald-600 focus:outline-none"
              placeholder="Where you got it, signed by, etc."
            />
          </label>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirmDelete) {
                  void remove();
                } else {
                  setConfirmDelete(true);
                  // Auto-cancel the confirm prompt after a few seconds.
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
              {confirmDelete ? "Tap again to confirm" : "Remove"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onToggle}
                disabled={saving}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
