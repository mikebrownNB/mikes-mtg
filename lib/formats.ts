/**
 * Formats we surface in the deck create UI. Values match Scryfall's
 * `legalities` keys exactly (e.g. `card.legalities.commander`), so we can
 * reuse them to render the format-legality dot on each deck card.
 */
export const FORMATS = [
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "commander",
  "pauper",
  "historic",
  "brawl",
  "premodern",
] as const;

export type Format = (typeof FORMATS)[number];

/**
 * Suggested mainboard size per format. Used to render an "n / target" hint
 * in the deck header. `null` means we won't show a target.
 */
export function targetSizeFor(format: string | null | undefined): number | null {
  switch (format) {
    case "commander":
    case "brawl":
      return 100;
    case "standard":
    case "pioneer":
    case "modern":
    case "legacy":
    case "vintage":
    case "pauper":
    case "historic":
    case "premodern":
      return 60;
    default:
      return null;
  }
}

/**
 * Whether the format uses a Commander zone. (Brawl uses a commander too,
 * Scryfall calls them both "legalities.commander"/"legalities.brawl".)
 */
export function hasCommanderZone(format: string | null | undefined): boolean {
  return format === "commander" || format === "brawl";
}
