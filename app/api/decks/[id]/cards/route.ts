import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { upsertCardByName } from "@/lib/scryfall";

const ZONES = ["mainboard", "sideboard", "commander", "maybeboard"] as const;
type Zone = (typeof ZONES)[number];

/**
 * Add a card to a deck.
 *
 * Body: { name: string } OR { card_id: string }; optional { quantity, zone }.
 *   - name → resolved via Scryfall, upserted into cards (lazy-mirror).
 *   - card_id → must already exist in cards (e.g. from collection scan).
 *
 * If a row for (deck_id, card_id, zone) already exists, quantity is bumped
 * by the requested amount instead of inserting a duplicate.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Verify the deck belongs to this user (RLS would block otherwise but a
  // 404 is friendlier than a generic insert failure later).
  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .maybeSingle();
  if (!deck) {
    return NextResponse.json({ error: "deck not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    card_id?: unknown;
    quantity?: unknown;
    zone?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const quantity =
    typeof body.quantity === "number" &&
    Number.isInteger(body.quantity) &&
    body.quantity > 0
      ? body.quantity
      : 1;
  const zone: Zone = ZONES.includes(body.zone as Zone)
    ? (body.zone as Zone)
    : "mainboard";

  let cardId: string;
  let cardName: string | null = null;

  if (typeof body.card_id === "string" && body.card_id.trim()) {
    cardId = body.card_id.trim();
  } else if (typeof body.name === "string" && body.name.trim()) {
    const service = createServiceClient();
    const upsert = await upsertCardByName(service, body.name.trim());
    if (!upsert.ok) {
      return NextResponse.json({ error: upsert.error }, { status: upsert.status });
    }
    cardId = upsert.card.id;
    cardName = upsert.card.name;
  } else {
    return NextResponse.json(
      { error: "name or card_id required" },
      { status: 400 },
    );
  }

  const { data: existing, error: findErr } = await supabase
    .from("deck_cards")
    .select("id, quantity")
    .eq("deck_id", deckId)
    .eq("card_id", cardId)
    .eq("zone", zone)
    .maybeSingle();
  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  if (existing) {
    const next = existing.quantity + quantity;
    const { error: updErr } = await supabase
      .from("deck_cards")
      .update({ quantity: next })
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      action: "incremented",
      quantity: next,
      card: { id: cardId, name: cardName },
    });
  }

  const { error: insErr } = await supabase.from("deck_cards").insert({
    deck_id: deckId,
    card_id: cardId,
    quantity,
    zone,
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    action: "added",
    quantity,
    card: { id: cardId, name: cardName },
  });
}
