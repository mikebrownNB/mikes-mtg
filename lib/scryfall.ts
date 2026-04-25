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
