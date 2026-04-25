import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  SCRYFALL_BASE,
  SCRYFALL_HEADERS,
  type ScryfallCard,
  cardRowFromScryfall,
} from "@/lib/scryfall";

/**
 * Add a card to the signed-in user's collection.
 *
 * Body: { name: string }  — the canonical Scryfall name (from autocomplete).
 *
 * Flow:
 *   1. Resolve the name to a single Scryfall card via /cards/named?exact=...
 *   2. Upsert that card into `cards` (service role; cards is public-read but
 *      RLS-write-locked, so the user-scoped client can't write here).
 *   3. If a non-foil, no-condition row already exists for this user+card,
 *      bump quantity. Otherwise insert a new collection_items row.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    foil?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const foil = body?.foil === true;
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  // 1. Resolve via Scryfall.
  const scryfallUrl = new URL(`${SCRYFALL_BASE}/cards/named`);
  scryfallUrl.searchParams.set("exact", name);
  const scryRes = await fetch(scryfallUrl.toString(), {
    headers: SCRYFALL_HEADERS,
  });
  if (!scryRes.ok) {
    return NextResponse.json(
      { error: `Scryfall returned ${scryRes.status} for "${name}"` },
      { status: scryRes.status === 404 ? 404 : 502 },
    );
  }
  const card = (await scryRes.json()) as ScryfallCard;

  // 2. Upsert into cards (service role bypasses RLS).
  const service = createServiceClient();
  const { error: cardErr } = await service
    .from("cards")
    .upsert(cardRowFromScryfall(card), { onConflict: "id" });
  if (cardErr) {
    return NextResponse.json(
      { error: `cards upsert failed: ${cardErr.message}` },
      { status: 500 },
    );
  }

  // 3. Find an existing default-condition row with the same foil flag to bump.
  // Foil and non-foil are kept as separate rows; condition is filled in later
  // via the collection editor (Phase 3) so we treat NULL as the default bucket.
  const { data: existing, error: findErr } = await supabase
    .from("collection_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("card_id", card.id)
    .eq("foil", foil)
    .is("condition", null)
    .maybeSingle();
  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  if (existing) {
    const nextQty = existing.quantity + 1;
    const { error: updErr } = await supabase
      .from("collection_items")
      .update({ quantity: nextQty })
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      action: "incremented",
      quantity: nextQty,
      card: { id: card.id, name: card.name },
    });
  }

  const { error: insErr } = await supabase.from("collection_items").insert({
    user_id: user.id,
    card_id: card.id,
    quantity: 1,
    foil,
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    action: "added",
    quantity: 1,
    card: { id: card.id, name: card.name },
  });
}
