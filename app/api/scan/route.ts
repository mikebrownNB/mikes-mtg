import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchScryfallFuzzy,
  fetchScryfallAutocomplete,
  type ScryfallCard,
} from "@/lib/scryfall";

// Allow up to ~25s on Vercel for OCR + Scryfall round-trip. Hobby cap is 60s
// for cron, 10s for default functions; bump explicitly so a slow Vision call
// doesn't 504 us. Scan images are resized client-side so payload stays small.
export const maxDuration = 25;

type ScanResponse =
  | {
      ok: true;
      ocr_text: string;
      candidate: string;
      // High-confidence: fuzzy returned a single card.
      match?: ScryfallCard;
      // Low-confidence: fuzzy missed; here are autocomplete suggestions.
      suggestions?: string[];
    }
  | { error: string };

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/**
 * Take the first non-empty line of the OCR'd text. Card names sit at the top
 * of the printed face, so the topmost text is almost always the name. (Vision
 * orders fullTextAnnotation.text top-to-bottom, left-to-right.)
 *
 * If the topmost line is suspiciously short (1-2 chars, often artifact glyphs
 * from set symbols or mana cost), fall back to the next line.
 */
function extractCandidateName(fullText: string): string {
  const lines = fullText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length >= 3) return line;
  }
  return lines[0] ?? "";
}

export async function POST(request: Request) {
  // Auth (middleware already 401s, but defence in depth).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<ScanResponse>(
      { error: "unauthenticated" },
      { status: 401 },
    );
  }

  if (!process.env.GOOGLE_VISION_API_KEY) {
    return NextResponse.json<ScanResponse>(
      { error: "GOOGLE_VISION_API_KEY is not configured" },
      { status: 503 },
    );
  }

  // Read image from multipart form.
  let imageBytes: ArrayBuffer;
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json<ScanResponse>(
        { error: "image field missing" },
        { status: 400 },
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json<ScanResponse>(
        { error: "image too large (max 5 MB)" },
        { status: 413 },
      );
    }
    imageBytes = await file.arrayBuffer();
  } catch (err) {
    return NextResponse.json<ScanResponse>(
      { error: err instanceof Error ? err.message : "form parse failed" },
      { status: 400 },
    );
  }

  // Base64-encode for Vision REST API. Buffer is available in Node runtime;
  // on Edge we'd need a different encoding path, but route handlers default
  // to Node so this is fine.
  const base64 = Buffer.from(imageBytes).toString("base64");

  // Call Google Cloud Vision: TEXT_DETECTION returns OCR for the whole image.
  const visionRes = await fetch(
    `${VISION_ENDPOINT}?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
            imageContext: { languageHints: ["en"] },
          },
        ],
      }),
    },
  );

  if (!visionRes.ok) {
    const detail = await visionRes.text().catch(() => "");
    return NextResponse.json<ScanResponse>(
      {
        error: `Vision API ${visionRes.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      },
      { status: 502 },
    );
  }

  const visionJson = (await visionRes.json()) as {
    responses?: Array<{
      fullTextAnnotation?: { text?: string };
      error?: { message?: string };
    }>;
  };

  const visionError = visionJson.responses?.[0]?.error?.message;
  if (visionError) {
    return NextResponse.json<ScanResponse>(
      { error: `Vision: ${visionError}` },
      { status: 502 },
    );
  }

  const fullText = visionJson.responses?.[0]?.fullTextAnnotation?.text ?? "";
  if (!fullText.trim()) {
    return NextResponse.json<ScanResponse>(
      {
        ok: true,
        ocr_text: "",
        candidate: "",
        suggestions: [],
      },
      { status: 200 },
    );
  }

  const candidate = extractCandidateName(fullText);

  // High-confidence: fuzzy match returns a single card.
  try {
    const match = await fetchScryfallFuzzy(candidate);
    if (match) {
      return NextResponse.json<ScanResponse>({
        ok: true,
        ocr_text: fullText,
        candidate,
        match,
      });
    }
  } catch (err) {
    return NextResponse.json<ScanResponse>(
      {
        error: err instanceof Error ? err.message : "Scryfall fuzzy failed",
      },
      { status: 502 },
    );
  }

  // Low-confidence: ambiguous / no match. Hand back autocomplete suggestions.
  const suggestions = await fetchScryfallAutocomplete(candidate);
  return NextResponse.json<ScanResponse>({
    ok: true,
    ocr_text: fullText,
    candidate,
    suggestions,
  });
}
