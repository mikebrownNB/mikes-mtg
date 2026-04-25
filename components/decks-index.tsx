"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATS } from "@/lib/formats";

export type DeckSummary = {
  id: string;
  name: string;
  format: string | null;
  description: string | null;
  updated_at: string;
};

export function DecksIndex({ decks }: { decks: DeckSummary[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<string>("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          format: format || null,
          description: description || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; deck: { id: string } }
        | { error: string };
      if (!res.ok || "error" in json) {
        setError("error" in json ? json.error : `HTTP ${res.status}`);
        return;
      }
      router.push(`/decks/${json.deck.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <form
          onSubmit={create}
          className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
        >
          <input
            autoFocus
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Deck name"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-emerald-600 focus:outline-none"
          >
            <option value="">Format (optional)…</option>
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
            placeholder="Description (optional)"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setError(null);
              }}
              disabled={submitting}
              className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/30 px-4 py-3 text-sm text-neutral-300 hover:border-emerald-700 hover:text-neutral-100"
        >
          + New deck
        </button>
      )}

      {decks.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          No decks yet — create one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {decks.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/50 p-3"
            >
              <Link href={`/decks/${d.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {d.format ?? "no format"}
                  {d.description ? ` · ${d.description}` : ""}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteId === d.id) void remove(d.id);
                  else {
                    setConfirmDeleteId(d.id);
                    setTimeout(() => {
                      setConfirmDeleteId((cur) => (cur === d.id ? null : cur));
                    }, 3000);
                  }
                }}
                className={`flex-shrink-0 rounded px-2 py-1 text-xs transition ${
                  confirmDeleteId === d.id
                    ? "bg-red-600 text-white"
                    : "border border-red-800 text-red-400 hover:bg-red-950"
                }`}
              >
                {confirmDeleteId === d.id ? "Confirm" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
