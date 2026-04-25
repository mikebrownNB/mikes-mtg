import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Update or remove a collection_items row. RLS scopes by `user_id = auth.uid()`,
 * so we don't need to filter explicitly — the policy handles it. We still
 * verify auth at the top so we can return a clean 401 instead of a generic
 * RLS-rejection error.
 */

const ALLOWED_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.quantity === "number") {
    if (!Number.isInteger(body.quantity) || body.quantity < 1) {
      return NextResponse.json(
        { error: "quantity must be a positive integer" },
        { status: 400 },
      );
    }
    update.quantity = body.quantity;
  }

  if (typeof body.foil === "boolean") {
    update.foil = body.foil;
  }

  if (body.condition === null || body.condition === "") {
    update.condition = null;
  } else if (typeof body.condition === "string") {
    if (!ALLOWED_CONDITIONS.has(body.condition)) {
      return NextResponse.json(
        { error: `condition must be one of ${[...ALLOWED_CONDITIONS].join(", ")}` },
        { status: 400 },
      );
    }
    update.condition = body.condition;
  }

  if (body.notes === null || body.notes === "") {
    update.notes = null;
  } else if (typeof body.notes === "string") {
    update.notes = body.notes.slice(0, 1000);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "no valid fields to update" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("collection_items")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
