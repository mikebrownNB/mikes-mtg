# mikes-mtg

Personal MTG collection scanner and deck builder. Mobile-first PWA built on Next.js 15 (App Router) + Supabase + Vercel.

See [`plan.md`](./plan.md) for the full design and phased build plan.

## Workflow

- No local dev server. Every change is committed to `main` and previewed on the Vercel auto-deploy URL.
- No local builds either (Node.js isn't installed on the dev machine) — TypeScript / lint errors are caught in Vercel build logs.
- Secrets live in Vercel's Environment Variables panel. See [`.env.example`](./.env.example) for the variable names.

## Database migrations

SQL files in [`supabase/migrations/`](./supabase/migrations) — paste them into the Supabase SQL editor in order.

## Phase status

- **Phase 1 — Foundation:** done. Auth (magic link), manual card lookup via Scryfall autocomplete, and add-to-collection are wired up end-to-end.
- **Phase 2 — Scanning:** done. Camera capture (`<input capture="environment">`), client-side image resize, Google Vision OCR, Scryfall fuzzy match with autocomplete fallback, foil toggle, continuous-scan loop.
- **Phase 3 — Collection management:** next. Filter/search/sort, edit quantity & condition, totals.

### Deferred from Phase 1

The original plan included a nightly Vercel cron that bulk-imports Scryfall's
`default_cards` JSON (~300 MB) into the local `cards` table. Vercel Hobby cron
jobs cap at ~60s, so we'd risk timeouts. Instead the app *lazy-mirrors* cards:
each card the user adds is fetched from Scryfall and upserted into `cards` on
the spot. If/when offline-style fast typeahead is needed, revisit the bulk
import (probably as a chunked / resumable job).
