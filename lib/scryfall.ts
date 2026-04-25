import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Scryfall API helpers. Per Scryfall's TOS we must send a User-Agent and Accept
 * header on every request. Free tier allows ~10 req/sec; we stay well under
 * that for personal use, but rely on Next.js fetch caching to deduplicate
 * identical autocomplete queries.
 */
export const SCRYFALL_BASE = "https://api.scryfall.com";

export const SCRYFALL_HEADERS = {
  "User-Agent": "mikes-mtg/0.1 (https://github.com/mikebrownNB/mikes-mtg)",
  Accept: "application/json",
};

/**
 * Subset of Scryfall's card object we care about. The full payload is also
 * stored in `cards.raw` so we can pull anything else later without a schema
 * change.
 */
export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  rarity?: string;
  image_uris?: Record<string, string>;
  prices?: Record<string, string | null>;
  layout?: string;
  card_faces?: Array<Record<string, unknown>>;
}

/**
 * Fuzzy-match a (possibly noisy) name against Scryfall. Returns the card on
 * success, `null` on a 404 (ambiguous / no match), and throws on transport /
 * 5xx errors so the caller can surface them.
 */
export async function fetchScryfallFuzzy(
  name: string,
): Promise<ScryfallCard | null> {
  const url = new URL(`${SCRYFALL_BASE}/cards/named`);
  url.searchParams.set("fuzzy", name);
  const res = await fetch(url.toString(), { headers: SCRYFALL_HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scryfall fuzzy returned ${res.status}`);
  return (await res.json()) as ScryfallCard;
}

/**
 * Autocomplete fallback when fuzzy match is ambiguous. Returns up to 20
 * candidate card names.
 */
export async function fetchScryfallAutocomplete(q: string): Promise<string[]> {
  const url = new URL(`${SCRYFALL_BASE}/cards/autocomplete`);
  url.searchParams.set("q", q);
  const res = await fetch(url.toString(), { headers: SCRYFALL_HEADERS });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: string[] };
  return json.data ?? [];
}

/**
 * Resolve a card name via Scryfall's `/cards/named?exact=` and upsert the
 * result into the `cards` table using a service-role Supabase client.
 *
 * Used by both /api/cards/add (build the user's collection) and
 * /api/decks/[id]/cards (build a deck) — keeps the lazy-mirror logic in
 * one place.
 *
 * Returns either `{ ok: true, card }` with the Scryfall payload or
 * `{ ok: false, error, status }` for the caller to surface to the client.
 */
export async function upsertCardByName(
  service: SupabaseClient,
  name: string,
): Promise<
  | { ok: true; card: ScryfallCard }
  | { ok: false; error: string; status: number }
> {
  const url = new URL(`${SCRYFALL_BASE}/cards/named`);
  url.searchParams.set("exact", name);
  const res = await fetch(url.toString(), { headers: SCRYFALL_HEADERS });
  if (!res.ok) {
    return {
      ok: false,
      error: `Scryfall returned ${res.status} for "${name}"`,
      status: res.status === 404 ? 404 : 502,
    };
  }
  const card = (await res.json()) as ScryfallCard;
  const { error } = await service
    .from("cards")
    .upsert(cardRowFromScryfall(card), { onConflict: "id" });
  if (error) {
    return { ok: false, error: `cards upsert: ${error.message}`, status: 500 };
  }
  return { ok: true, card };
}

/**
 * Map a Scryfall card payload to our `cards` table row shape.
 */
export function cardRowFromScryfall(card: ScryfallCard) {
  return {
    id: card.id,
    oracle_id: card.oracle_id ?? null,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: card.type_line ?? null,
    oracle_text: card.oracle_text ?? null,
    colors: card.colors ?? null,
    color_identity: card.color_identity ?? null,
    rarity: card.rarity ?? null,
    image_uris: card.image_uris ?? null,
    prices: card.prices ?? null,
    layout: card.layout ?? null,
    card_faces: card.card_faces ?? null,
    raw: card,
  };
}
