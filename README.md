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

- **Phase 1 — Foundation:** scaffold pushed; Supabase + Vercel wiring is the next step.
