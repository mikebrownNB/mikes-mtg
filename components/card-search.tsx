"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AddResponse =
  | {
      ok: true;
      action: "added" | "incremented";
      quantity: number;
      card: { id: string; name: string };
    }
  | { error: string };

export function CardSearch() {
  const router = useRouter();
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
      const res = await fetch("/api/cards/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as AddResponse;

      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        setFeedback({ kind: "err", text: msg });
        return;
      }

      setFeedback({
        kind: "ok",
        text:
          json.action === "incremented"
            ? `${json.card.name} → ×${json.quantity}`
            : `Added ${json.card.name}`,
      });
      setQuery("");
      setResults([]);
      router.refresh();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Scryfall…"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
      />

      {loading && (
        <p className="text-xs text-neutral-500">Searching…</p>
      )}

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
