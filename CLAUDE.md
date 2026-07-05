# CLAUDE.md

Context for Claude Code working in this repo. Read `docs/business.md` (domain rules) and
`docs/design.md` (schema, API, stack) before writing code — they are the spec. This file is
the operating manual: stack, commands, conventions, and what "done" means.

## What this is

A per-month personal money tracker: record each month's expenses and income, split bills
with other people via per-person ledgers, and see cash on hand. Go REST API + Postgres,
Next.js frontend. Each month is a closed box — no balance carries over.

## Stack

- Backend: Go, `chi` router, `pgx/v5`, `sqlc` (typed queries), `goose` (migrations).
- DB: Postgres (Neon in prod).
- Frontend: Next.js (App Router) on Vercel.
- Money: `int64` satang everywhere in the backend. Never floats. 1 baht = 100 satang.

## Repo layout

Monorepo, three top-level folders:

- `docs/` — `business.md` (domain rules), `design.md` (schema, API, stack), `business_th.md`.
- `tallo_service/` — Go backend. See `docs/design.md` §6. In short: `cmd/api` (entrypoint),
  `internal/{config,money,store,service,http}`, `migrations/`, `sql/queries/`. Business logic
  lives in `service`; SQL is generated into `store`.
- `tallo_app/` — Next.js frontend.

## Commands

All backend commands run from `tallo_service/`:

```bash
cd tallo_service

# run API locally (needs DATABASE_URL)
go run ./cmd/api

# tests
go test ./...

# regenerate typed queries after editing sql/queries/*.sql
sqlc generate

# migrations
goose -dir migrations postgres "$DATABASE_URL" up
goose -dir migrations postgres "$DATABASE_URL" down

# format / vet before finishing
gofmt -w . && go vet ./...
```

Frontend commands run from `tallo_app/` (`npm run dev`, `npm run build`, etc — standard
Next.js scripts).

Local Postgres for dev:
```bash
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
export DATABASE_URL="postgres://postgres:dev@localhost:5432/postgres?sslmode=disable"
```

## Conventions (follow these)

- **Money:** all amounts are `int64` satang. Only the `internal/money` package divides or
  rounds satang — implement split rounding there (owner absorbs the remainder, see
  `docs/business.md` §8). No money math in handlers.
- **Layering:** handlers parse + validate + call a service, nothing more. No SQL in handlers.
  Services own transactions; split and clone each run in one tx.
- **Computed values:** `net` and the five dashboard totals are always computed on read, never
  stored. Return the full month (with `summary`) from every write endpoint.
- **Statuses are enums** in the DB (`expense_status`, `income_status`, `person_status`) — do
  not use free-text status strings.
- **Errors:** one JSON envelope `{"error":{"code","message"}}`; map validation → 400,
  missing → 404, everything unexpected → 500. Don't leak driver errors to clients.
- **Thai data:** UI labels and names are Thai/mixed (e.g. "บัตร / สินเชื่อ", "Person B"). Treat
  all text as UTF-8; never assume ASCII lengths.
- **IDs:** UUID (`gen_random_uuid()`), returned as strings.
- **No new dependencies** beyond the ones in the stack list without calling it out first.

## Business rules that are easy to get wrong

- Splitting an expense does **not** reduce the expense — the owner paid it in full. The
  split only writes positive entries into other people's ledgers.
- A person's net can be **negative** (they paid the owner in advance). Negative net is a
  payable (รอจ่าย / จ่ายแล้ว), not a receivable. See `docs/business.md` §7, §9.
- Split entries are **snapshots** — editing the source expense later must not change them.
  `source_expense_id` is for traceability only.
- Cloning a month copies expenses and direct incomes (status reset to `pending`) but **never**
  copies people or ledger entries.
- `custom` is the only expense figure used in totals; `amount`/`minimum` are reference.

## Definition of done (per change)

1. `go build ./...` and `go test ./...` pass.
2. `gofmt -w .` and `go vet ./...` clean.
3. New/changed business rules have table-driven tests (esp. `money` and `service/summary`).
4. Schema changes ship as a new `goose` migration (never edit an applied migration).
5. If a rule changed, `docs/business.md` / `docs/design.md` updated in the same change.

## Roadmap (build order)

- [ ] Migrations `0001_init` (schema from `docs/design.md` §3).
- [ ] `money` package + tests.
- [ ] `store` via sqlc: CRUD queries for all tables.
- [ ] `service`: get-month-with-summary, split, clone.
- [ ] `http`: routers + handlers for months, expenses, incomes, people, entries.
- [ ] CORS + config + `cmd/api` wiring.
- [ ] Frontend `api.ts` client; build panels; add per-person ledger UI.
- [ ] Deploy: Neon + Cloud Run (backend), Vercel (frontend).
