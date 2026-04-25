"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  set_name?: string;
  type_line?: string;
  image_uris?: { small?: string; normal?: string };
};

type ScanResponse =
  | {
      ok: true;
      ocr_text: string;
      candidate: string;
      match?: ScryfallCard;
      suggestions?: string[];
    }
  | { error: string };

type Phase =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "matched"; card: ScryfallCard; previewUrl: string }
  | {
      kind: "ambiguous";
      candidate: string;
      ocrText: string;
      suggestions: string[];
      previewUrl: string;
    }
  | { kind: "no_text"; previewUrl: string }
  | { kind: "error"; message: string };

/**
 * Resize an image client-side before upload. Phone cameras default to ~12MP
 * which can blow past Vercel's 4.5MB request limit AND Vision's preference
 * for ~1024px source. We draw onto a canvas at max 1280px and re-encode JPEG
 * at q=0.85.
 */
async function resizeImage(file: File, maxDim = 1280): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.85,
    );
  });
}

async function addCardByName(name: string, foil: boolean) {
  const res = await fetch("/api/cards/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, foil }),
  });
  const json = (await res.json()) as
    | { ok: true; action: "added" | "incremented"; quantity: number; card: { name: string } }
    | { error: string };
  if ("error" in json) throw new Error(json.error);
  return json;
}

export function ScanFlow() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [adding, setAdding] = useState(false);
  const [foil, setFoil] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function reset() {
    if (phase.kind !== "idle" && "previewUrl" in phase) {
      URL.revokeObjectURL(phase.previewUrl);
    }
    setPhase({ kind: "idle" });
    setFeedback(null);
    setFoil(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhase({ kind: "scanning" });
    setFeedback(null);

    let blob: Blob;
    try {
      blob = await resizeImage(file);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "image resize failed",
      });
      return;
    }
    const previewUrl = URL.createObjectURL(blob);

    const formData = new FormData();
    formData.append("image", blob, "scan.jpg");

    try {
      const res = await fetch("/api/scan", { method: "POST", body: formData });
      const json = (await res.json()) as ScanResponse;

      if (!res.ok || "error" in json) {
        URL.revokeObjectURL(previewUrl);
        setPhase({
          kind: "error",
          message: "error" in json ? json.error : `HTTP ${res.status}`,
        });
        return;
      }

      if (json.match) {
        setPhase({ kind: "matched", card: json.match, previewUrl });
      } else if (json.candidate && (json.suggestions?.length ?? 0) > 0) {
        setPhase({
          kind: "ambiguous",
          candidate: json.candidate,
          ocrText: json.ocr_text,
          suggestions: json.suggestions ?? [],
          previewUrl,
        });
      } else {
        setPhase({ kind: "no_text", previewUrl });
      }
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "network error",
      });
    }
  }

  async function confirmMatch(name: string) {
    setAdding(true);
    setFeedback(null);
    try {
      const result = await addCardByName(name, foil);
      setFeedback(
        result.action === "incremented"
          ? `${result.card.name} → ×${result.quantity}`
          : `Added ${result.card.name}${foil ? " (foil)" : ""}`,
      );
      router.refresh();
      // Auto-reset to camera for continuous-scan flow.
      setTimeout(reset, 700);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "add failed");
    } finally {
      setAdding(false);
    }
  }

  // ---------- render ----------
  if (phase.kind === "idle") {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900/50 text-sm text-neutral-400 hover:border-emerald-700 hover:text-neutral-200">
          <span className="text-base font-medium">Tap to take a photo</span>
          <span className="text-xs">
            (will open your camera on mobile)
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileChange}
            className="hidden"
          />
        </label>
        {feedback && (
          <p className="text-center text-xs text-emerald-400">{feedback}</p>
        )}
      </div>
    );
  }

  if (phase.kind === "scanning") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-500" />
        <p className="text-sm text-neutral-400">Reading card…</p>
      </div>
    );
  }

  if (phase.kind === "matched") {
    const img =
      phase.card.image_uris?.normal ?? phase.card.image_uris?.small ?? null;
    return (
      <div className="flex flex-col gap-4">
        {img && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img}
            alt={phase.card.name}
            className="mx-auto w-2/3 rounded-lg shadow-lg"
          />
        )}
        <div className="text-center">
          <p className="text-lg font-semibold">{phase.card.name}</p>
          <p className="text-xs text-neutral-400">
            {phase.card.set_name ?? phase.card.set?.toUpperCase()}
            {phase.card.type_line ? ` · ${phase.card.type_line}` : ""}
          </p>
        </div>
        <label className="flex items-center justify-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={foil}
            onChange={(e) => setFoil(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          Foil
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => confirmMatch(phase.card.name)}
            disabled={adding}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to collection"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={adding}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
          >
            Wrong card
          </button>
        </div>
        {feedback && (
          <p className="text-center text-xs text-emerald-400">{feedback}</p>
        )}
      </div>
    );
  }

  if (phase.kind === "ambiguous") {
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={phase.previewUrl}
          alt="scanned card"
          className="mx-auto w-1/2 rounded-lg shadow-lg"
        />
        <div>
          <p className="text-sm text-neutral-300">
            OCR read:{" "}
            <span className="font-mono text-neutral-100">{phase.candidate}</span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Couldn&apos;t auto-match. Pick the right card:
          </p>
        </div>
        {phase.suggestions.length === 0 ? (
          <p className="text-sm text-neutral-500">No suggestions found.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
            {phase.suggestions.slice(0, 10).map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => confirmMatch(name)}
                  disabled={adding}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  <span className="truncate">{name}</span>
                  <span className="ml-3 flex-shrink-0 text-xs text-neutral-500">
                    Add +
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={reset}
          className="text-xs text-neutral-400 underline underline-offset-2"
        >
          Cancel and rescan
        </button>
        {feedback && (
          <p className="text-center text-xs text-red-400">{feedback}</p>
        )}
      </div>
    );
  }

  if (phase.kind === "no_text") {
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={phase.previewUrl}
          alt="scanned card"
          className="mx-auto w-1/2 rounded-lg shadow-lg"
        />
        <p className="text-sm text-red-400">
          Couldn&apos;t read any text. Try better lighting or center the card title.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  // error
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-red-400">Error: {phase.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
      >
        Try again
      </button>
    </div>
  );
}
