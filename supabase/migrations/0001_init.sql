-- mikes-mtg initial schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent-ish (uses `if not exists` where it can), but the safe assumption
-- is to run it once on a fresh project.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pg_trgm powers the typeahead (name ILIKE / similarity) used in the manual lookup UI.
-- Must be created BEFORE the trigram index below references gin_trgm_ops.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Cards: local mirror of Scryfall data (populated nightly by /api/cron/scryfall)
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id uuid primary key,                   -- Scryfall id
  oracle_id uuid,                        -- groups all printings of the same card
  name text not null,
  set_code text,
  collector_number text,
  mana_cost text,
  cmc numeric,
  type_line text,
  oracle_text text,
  colors text[],
  color_identity text[],
  rarity text,
  image_uris jsonb,                      -- small/normal/large/png/art_crop
  prices jsonb,
  layout text,
  card_faces jsonb,                      -- for double-faced cards
  raw jsonb                              -- full Scryfall payload, for anything we didn't model
);

create index if not exists cards_name_tsv_idx
  on public.cards using gin (to_tsvector('english', name));
create index if not exists cards_oracle_id_idx
  on public.cards (oracle_id);
create index if not exists cards_name_trgm_idx
  on public.cards using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Collection: cards the user owns
-- ---------------------------------------------------------------------------
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  card_id uuid references public.cards on delete restrict not null,
  quantity int not null default 1 check (quantity > 0),
  foil boolean not null default false,
  condition text,                         -- NM, LP, MP, HP, DMG
  notes text,
  scanned_image_url text,                 -- the photo taken at scan time
  acquired_at timestamptz not null default now()
);
create index if not exists collection_items_user_idx
  on public.collection_items (user_id);
create index if not exists collection_items_card_idx
  on public.collection_items (card_id);

-- ---------------------------------------------------------------------------
-- Decks
-- ---------------------------------------------------------------------------
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  format text,                            -- commander, modern, etc.
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decks_user_idx on public.decks (user_id);

create table if not exists public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks on delete cascade not null,
  card_id uuid references public.cards on delete restrict not null,
  quantity int not null default 1 check (quantity > 0),
  zone text not null default 'mainboard'   -- mainboard, sideboard, commander, maybeboard
);
create index if not exists deck_cards_deck_idx on public.deck_cards (deck_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Cards are public-read (every signed-in user can search them); writes are restricted to
-- the service role (used by the nightly Scryfall import job).
alter table public.cards enable row level security;
drop policy if exists "cards are readable by anyone" on public.cards;
create policy "cards are readable by anyone"
  on public.cards for select
  using (true);
-- (no insert/update/delete policy -> only the service role can mutate)

alter table public.collection_items enable row level security;
drop policy if exists "users manage their own collection" on public.collection_items;
create policy "users manage their own collection"
  on public.collection_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.decks enable row level security;
drop policy if exists "users manage their own decks" on public.decks;
create policy "users manage their own decks"
  on public.decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.deck_cards enable row level security;
drop policy if exists "users manage cards in their own decks" on public.deck_cards;
create policy "users manage cards in their own decks"
  on public.deck_cards for all
  using (
    exists (
      select 1 from public.decks d
      where d.id = deck_cards.deck_id and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.decks d
      where d.id = deck_cards.deck_id and d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- updated_at trigger for decks
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists decks_set_updated_at on public.decks;
create trigger decks_set_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();
