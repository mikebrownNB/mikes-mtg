# MTG Collection Scanner — Build Plan

A mobile-first web app that scans MTG cards via phone camera, identifies them, stores them in your collection, and lets you build decks visually. Built on Vercel + Supabase.

**Repo:** https://github.com/mikebrownNB/mikes-mtg

---

## Instructions for Claude Code

You are the agent building this project. Read this whole document before starting. Rules of engagement:

1. **No dev server.** Do not run `npm run dev`, `next dev`, or any long-running local server. We do not iterate against `localhost`. Every change goes to GitHub and is previewed via Vercel's auto-deploy.
2. **Local builds are fine and encouraged.** Run `npm install`, `npm run build`, `npm run lint`, `tsc --noEmit`, and tests as needed to catch errors before pushing. Catching a TypeScript error locally is much better than catching it in the Vercel build log.
3. **Commit and push directly to `main`.** No feature branches, no PRs. Make commits in logical chunks (e.g. "scaffold Next.js app", "add Supabase schema", "add Scryfall import route") rather than one giant commit. Push after each meaningful unit so Vercel deploys progressively.
4. **You cannot access third-party dashboards.** Vercel, Supabase, Google Cloud, and GitHub web UIs are off-limits — only the user can click around in those. When the plan calls for dashboard work (creating a project, setting env vars, running SQL in the Supabase editor, enabling an API), **stop and give the user a clear, numbered checklist** of what to do, then wait for confirmation before proceeding.
5. **Secrets never go in the repo.** Not in `.env`, not committed, not in code. Provide a `.env.example` with the variable names and tell the user to set the real values in the Vercel dashboard. For local builds that need them, the user can create an untracked `.env.local`.
6. **Schema changes are SQL files committed to the repo** under `supabase/migrations/` (or similar). The user runs them in the Supabase SQL editor. Don't try to apply migrations programmatically.
7. **Stop at phase boundaries.** After completing each phase from Section 7, stop and summarize what you did, what the user needs to verify on the deployed URL, and what one-time setup (if any) is needed before the next phase. Don't blow through all five phases in one shot.
8. **Follow the plan's stack choices** unless you have a strong reason not to: Next.js 15 App Router, TypeScript (strict), Tailwind, shadcn/ui, Supabase (Postgres + Auth + Storage), dnd-kit for drag-and-drop, Scryfall for card data, Google Vision for OCR.
9. **First action:** confirm you've read this document, then ask the user to confirm the one-time setup from Section 0 is done (or offer to walk them through it) before starting Phase 1's scaffolding.

---

## 0. Development workflow

No local dev server, no iterating against `localhost`. Every change is committed straight to `main` on GitHub, Vercel auto-deploys, and you preview on the live URL. This is well-suited to a mobile-first app — you just hit the deployed URL on your phone, no LAN/IP/port juggling.

(Local *builds* — `npm run build`, `tsc`, lint, tests — are still fine and encouraged before pushing. The rule is "no dev server / no localhost previews," not "never run anything locally.")

**The loop looks like this:**
1. I write or modify code, commit to `main`, push to `mikebrownNB/mikes-mtg`.
2. Vercel detects the push and auto-deploys (~30–60s).
3. You hit the deployed URL on your phone or laptop, give feedback, we iterate.

**Trade-offs to be aware of:**
- **No local sandbox** means a broken commit = broken deployment until the next push fixes it. For a personal tool that's fine, but I'll be deliberate about not pushing obviously-broken changes.
- **Type errors and lint issues only surface at build time** on Vercel rather than instantly on save. Vercel's build logs are where we catch these. I'll lean on TypeScript strictness and run logic mentally before committing.
- **Secrets stay in Vercel's environment variable UI** — never committed to the repo. You'll set these directly in the Vercel dashboard (Supabase keys, Google Vision API key, etc.). I'll tell you exactly what to add and when.
- **Database migrations** run via the Supabase SQL editor in the dashboard, not locally. I'll provide the SQL; you paste and run.

**One-time setup you'll need to do (I can't do these for you):**
1. Connect the `mikes-mtg` repo to a new Vercel project (Vercel dashboard → Add New → Project → Import).
2. Create a Supabase project at supabase.com.
3. Create a Google Cloud project, enable the Vision API, generate an API key.
4. Drop those credentials into Vercel's environment variables panel.

I'll walk you through each of those when we get to the relevant phase.

---

## 1. The card identification problem (this is the hard part)

There are essentially three approaches. They have very different tradeoffs:

### Option A: OCR the card name → fuzzy match against Scryfall (recommended for v1)

The card's printed name is the most reliable identifier. You OCR the title bar, then hand the result to Scryfall's `/cards/named?fuzzy=` endpoint, which is *built* for messy input — `jac bele` resolves to Jace Beleren. This is the approach the open-source `mtgscan` project uses and it works well.

**OCR options:**
- **Google Cloud Vision API** — best accuracy, ~$1.50 per 1000 images, generous free tier (1000/month). My pick.
- **Azure Computer Vision (Read API)** — comparable, ~$1/1000, what `mtgscan` uses.
- **Tesseract.js** — free, runs in-browser. Quality is rougher and you'll have more fuzzy-match misses, but $0 cost and no network round trip is genuinely appealing for a personal tool.

**Pros:** Cheap, language-agnostic-ish (English-first but can be extended), Scryfall fuzzy matching is forgiving, no ML training, full card data comes back from Scryfall for free.

**Cons:** Needs a reasonably clear photo of the title bar. Doesn't distinguish between printings (different sets) of the same card — you'd pick the printing in a follow-up step, or default to most recent and let yourself correct it.

### Option B: Visual recognition API (Ximilar)

Ximilar has a dedicated TCG identifier that handles MTG and returns set/printing info from a photo. Pay-per-call (credits-based, est. cents per scan).

**Pros:** Identifies the actual printing, handles foils/alt arts, works on partial/angled shots better than OCR.

**Cons:** Costs real money per scan, vendor lock-in, overkill for a personal collection unless you care a lot about distinguishing printings automatically.

### Option C: Perceptual hashing against Scryfall's image bulk data

Download Scryfall's bulk card image data, compute a perceptual hash (pHash) of every card, and at scan time hash the captured image and find the nearest neighbor. This is what the "Magic Card Detector" blog project does.

**Pros:** Free at runtime, identifies the exact printing, works offline.

**Cons:** Significant upfront work — hash database is large (Scryfall has ~100k+ unique printings), needs OpenCV-style segmentation to crop the card cleanly first, and you have to update it as new sets release.

### Recommendation

**Start with Option A (OCR + Scryfall fuzzy match).** It's the shortest path to working software. If accuracy or printing-discrimination becomes a problem later, you can layer Option B as a paid fallback for low-confidence matches, or build Option C as a v2 project.

---

## 2. Data source: Scryfall (always)

Regardless of identification approach, Scryfall is your card data backbone:

- `/cards/named?fuzzy=...` — resolves messy OCR text to a card
- `/cards/autocomplete?q=...` — for manual entry / typeahead corrections
- `/cards/search?q=...` — full Scryfall syntax for advanced lookups
- **Bulk data endpoints** — daily JSON dumps of every card. Download once, cache in Supabase, refresh nightly. Saves 99% of API calls and gives you sub-millisecond local lookups.

Rate limit: 2 requests/sec, 50–100ms delay between calls. Required headers: `User-Agent: YourAppName/1.0` and `Accept: application/json`. They're strict about it but free.

Important fine print: their terms forbid paywalling Scryfall data and require crediting artists when you display art crops. Personal-use app, so no problem, but worth knowing.

---

## 3. Architecture

```
┌─────────────────────────────┐
│  Mobile web (Next.js PWA)   │
│  - Camera capture           │
│  - Collection browser       │
│  - Deck builder (drag/drop) │
└──────────────┬──────────────┘
               │
       ┌───────▼────────┐         ┌──────────────────┐
       │  Next.js API   │────────▶│  OCR provider    │
       │  routes        │         │  (Vision API)    │
       │  (Vercel)      │         └──────────────────┘
       └───────┬────────┘         ┌──────────────────┐
               │─────────────────▶│  Scryfall API    │
               │                  └──────────────────┘
       ┌───────▼────────┐
       │  Supabase      │
       │  - Postgres    │
       │  - Auth        │
       │  - Storage     │
       │  (card images) │
       └────────────────┘
```

**Stack:**
- **Next.js 15 (App Router) on Vercel** — handles both the React frontend and the API routes for OCR/Scryfall proxying.
- **Supabase** — Postgres for the data, Auth for login (even single-user, this lets you scan from any device), Storage for the captured card photos.
- **Tailwind + shadcn/ui** — fast UI, looks decent out of the box.
- **dnd-kit** — for the deck builder drag-and-drop. Mature, accessible, works on touch.

---

## 4. Database schema (Supabase / Postgres)

```sql
-- Local mirror of Scryfall data, populated from their bulk download
create table cards (
  id uuid primary key,                    -- Scryfall id
  oracle_id uuid,                         -- groups all printings of same card
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
  image_uris jsonb,                       -- small/normal/large/png/art_crop
  prices jsonb,
  layout text,
  card_faces jsonb,                       -- for double-faced cards
  raw jsonb                               -- full Scryfall payload, for anything you didn't model
);
create index on cards using gin (to_tsvector('english', name));
create index on cards (oracle_id);

-- Your owned cards
create table collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  card_id uuid references cards not null,
  quantity int not null default 1,
  foil boolean default false,
  condition text,                         -- NM, LP, MP, HP, DMG
  notes text,
  scanned_image_url text,                 -- the photo you took
  acquired_at timestamptz default now()
);
create index on collection_items (user_id);

create table decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  format text,                            -- commander, modern, etc
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references decks on delete cascade not null,
  card_id uuid references cards not null,
  quantity int not null default 1,
  zone text not null default 'mainboard'  -- mainboard, sideboard, commander, maybeboard
);
create index on deck_cards (deck_id);
```

Enable Row Level Security on `collection_items`, `decks`, `deck_cards` so each row is scoped to `auth.uid()`. The `cards` table is public-read.

---

## 5. The scan flow

This is the UX that matters most. Here's what happens when you tap "Scan":

1. **Camera capture.** Use the browser's `getUserMedia` API with a `<video>` element, or just `<input type="file" accept="image/*" capture="environment">` for the simplest path. The latter triggers the native camera UI on mobile and is honestly fine.
2. **Crop hint overlay.** Show a card-shaped frame so users center the card. Don't actually require precise alignment — the OCR works on the title region anyway.
3. **Upload.** POST the image to a Next.js API route (`/api/scan`).
4. **Server: OCR.** Send the image to Google Vision. Extract the highest-confidence text near the top of the card.
5. **Server: Match.** Call `https://api.scryfall.com/cards/named?fuzzy={ocr_text}`.
6. **Confidence check.**
   - **High confidence match (Scryfall returns a single card):** show the card preview with "Add to collection" / "Scan another" / "Wrong card" buttons.
   - **Ambiguous (404 from fuzzy):** call `/cards/autocomplete` with the OCR text and present a picker.
7. **Save.** On confirm, write to `collection_items` and (optionally) upload the photo to Supabase Storage.

A few touches that make this feel good:
- **Continuous scan mode.** After confirming, immediately reset to camera. Lets you scan a stack quickly.
- **Quantity increment.** If you scan a card you already own, just bump quantity by default.
- **Set picker.** After identification, show a dropdown of available printings (Scryfall's `prints_search_uri` on the card object gets you this) so you can pick the right set if you care.

---

## 6. Deck builder

The "visually organize" part. Some patterns that work well:

- **Two-pane layout.** Collection on the left (filterable by name/color/type/CMC), deck on the right.
- **Mana curve sidebar.** A bar chart of CMC distribution updates as you drag cards in. Simple but the most-asked-for visualization in any deck builder.
- **Group-by toggle.** Let the deck view group by type (Creatures, Lands, Instants...) or by CMC. Both are standard.
- **Card image hover/long-press.** Show the full art on hover (desktop) or long-press (mobile).
- **Quantity badges.** A `×3` badge on the corner; tap to adjust.
- **Format legality indicator.** Scryfall returns legality per format on each card — show a green/red dot for the deck's format.
- **Export.** Plain text decklist (the standard `4 Lightning Bolt` format) for pasting into Arena/MTGO/Moxfield.

Drag-and-drop with **dnd-kit** has good touch support out of the box. Long-press to pick up, drag to drop zone.

---

## 7. Build order (suggested phases)

**Phase 1 — Foundation (a weekend):**
- I scaffold a Next.js 15 app, commit it to `mikes-mtg` on `main`
- You connect the repo to Vercel and Supabase (one-time, ~10 minutes)
- I write the Supabase schema as a SQL file in the repo; you paste it into the Supabase SQL editor
- Scryfall bulk import as a Vercel cron job (nightly pull of `default_cards` into the `cards` table)
- Manual card lookup UI (typeahead → add to collection). Validates the whole stack — auth, DB, deployments — without touching computer vision yet.

**Phase 2 — Scanning (a weekend):**
- File-input camera capture
- `/api/scan` route with Google Vision OCR
- Scryfall fuzzy match + confirmation UI
- Continuous scan loop

**Phase 3 — Collection management (a few evenings):**
- Filter/search/sort collection
- Edit quantity, condition, foil status
- Total value calculation (sum of `prices.usd × quantity`)

**Phase 4 — Deck builder:**
- Decks CRUD
- Drag-and-drop with dnd-kit
- Mana curve, type breakdown, format legality
- Decklist export

**Phase 5 — Nice-to-haves:**
- Multi-card scanning (binder page mode — needs Ximilar or pHash)
- Trade tracking
- Wishlist / "cards I'm missing for this deck" view
- Price history graphs

---

## 8. Cost estimate (personal use)

- **Vercel Hobby:** $0
- **Supabase Free tier:** $0 (500MB DB, 1GB storage — plenty unless you upload every scan photo)
- **Google Vision OCR:** $0 for first 1000 scans/month, then $1.50/1000. If you scan 5000 cards in a marathon weekend, that's ~$6.
- **Scryfall:** $0

Realistically: **$0–$5/month** for a personal collection scanner.

---

## 9. Things to think about before starting

- **Foil cards** are notoriously hard to photograph for OCR — glare on the title. Worth a manual "this is a foil" toggle on the confirmation step.
- **Double-faced cards** (DFCs/MDFCs) — Scryfall handles these via a `card_faces` array. You'll only OCR one face, but Scryfall returns both. Make sure your card detail UI flips between faces.
- **Non-English cards** — out of scope for v1 unless you want them. If you do, Google Vision handles most languages and Scryfall has a `lang` parameter.
- **Tokens, emblems, art cards** — Scryfall indexes these too. Filter out `layout: token` etc. from search results unless you care.
- **The Wizards Fan Content Policy** — keep it personal, don't sell access, credit artists when displaying art crops. You're well within limits for a personal tool.

---

## Want me to start building?

Phase 1 is the natural starting point. When you're ready, I'll:

1. Scaffold the Next.js app and push the initial commit to `mikebrownNB/mikes-mtg`.
2. Hand you a checklist of one-time setup steps (Vercel project, Supabase project, env vars).
3. Once those are wired up, push the schema SQL and the Scryfall import job.

Just say go.
