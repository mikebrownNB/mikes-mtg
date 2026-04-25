import { NextResponse } from "next/server";
import { SCRYFALL_BASE, SCRYFALL_HEADERS } from "@/lib/scryfall";

/**
 * Typeahead proxy to Scryfall's `/cards/autocomplete`. Auth is enforced by
 * middleware (which 401s unauthenticated /api requests). The 5-minute fetch
 * cache means repeated keystrokes cost nothing on the Scryfall side.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ data: [] });

  const url = new URL(`${SCRYFALL_BASE}/cards/autocomplete`);
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: SCRYFALL_HEADERS,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { data: [], error: `Scryfall returned ${res.status}` },
      { status: 502 },
    );
  }

  const json = (await res.json()) as { data?: string[] };
  return NextResponse.json({ data: json.data ?? [] });
}
