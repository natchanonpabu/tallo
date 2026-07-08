# CLAUDE.md

Context for Claude Code working in this repo. Read `docs/business.md` (domain rules),
`docs/design.md` (schema, API, stack), and `docs/frontend-design.md` (visual/UI design —
colors, type, components) before writing code — they are the spec. This file is the
operating manual: stack, commands, conventions, and what "done" means.

## What this is

A per-month personal money tracker: record each month's expenses and income, split bills with
other people via global (cross-month) per-person ledgers, and see this month's net cash flow. Go
REST API + Postgres, Next.js frontend. Each month is a closed box — no balance carries over; the
headline number is a monthly flow, not a bank balance.

**Multi-user (business.md §13, D7):** login is required (email + password + session cookie) and
everyone owns their own months/expenses/incomes/people — every query is scoped by `user_id`. Two
users can **link** a shared person via invite + accept; linked charges/settlements auto-mirror to
the counterpart (sign flipped per viewer), and either side can dispute an item. No single-owner
mode anymore.

## Stack

- Backend: Go, `chi` router, `pgx/v5`, `sqlc` (typed queries), `goose` (migrations).
- DB: Postgres (Neon in prod).
- Frontend: Next.js (App Router) on Vercel.
- Money: `int64` satang everywhere in the backend. Never floats. 1 baht = 100 satang.

## Repo layout

Monorepo, three top-level folders:

- `docs/` — `business.md` (domain rules), `design.md` (schema, API, stack),
  `frontend-design.md` (visual/UI design), `business_th.md`.
- `tallo_service/` — Go backend. See `docs/design.md` #6. In short: `cmd/api` (entrypoint),
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
  `docs/business.md` #8). No money math in handlers.
- **Layering:** handlers parse + validate + call a service, nothing more. No SQL in handlers.
  Services own transactions; split, clone, and settle each run in one tx.
- **Computed values:** person `net` (running), the two People totals, and the five month totals
  are always computed on read, never stored. A write returns the aggregate it changed — the
  month (with `summary`), the people aggregate, or both for a settlement (`docs/design.md` #5).
- **Statuses are enums** in the DB (`expense_status`, `income_status`, `link_request_status`) —
  do not use free-text status strings. People have **no** status enum: a person is a global
  running tab (squared up exactly when net = 0).
- **Auth + scoping:** login is required (email + password, bcrypt, session cookie). Every query
  filters by the signed-in `user_id`; the session middleware puts it in context and handlers pass
  it down (`docs/design.md` §5/#6). Another user's row reads as **404**, never 403 — don't reveal
  it exists. Never return `password_hash`.
- **Errors:** one JSON envelope `{"error":{"code","message"}}`; map validation → 400,
  missing → 404, everything unexpected → 500. Don't leak driver errors to clients.
- **Thai data:** UI labels and names are Thai/mixed (e.g. "บัตร / สินเชื่อ", "Person B"). Treat
  all text as UTF-8; never assume ASCII lengths.
- **IDs:** UUID (`gen_random_uuid()`), returned as strings.
- **No new dependencies** beyond the ones in the stack list without calling it out first.

## Business rules that are easy to get wrong

- **People are global (cross-month), not per-month** — one record per person, ledger runs across
  all months (`docs/business.md` D6). Only a **settlement** ties a person to a month.
- Splitting an expense does **not** reduce the expense — the owner paid it in full. The split
  only writes positive **charges** into people's ledgers (people matched/created globally by name).
- A person's running net can be **negative** (they paid the owner in advance). Open balances live
  in the People section and never fold into a month's tiles; a **settlement** is what moves money
  into a month's จ่ายแล้ว / รับแล้ว (`docs/business.md` #9, D6).
- Split **charges** are **snapshots** — editing the source expense later must not change them.
  `source_expense_id` is for traceability only.
- Cloning a month copies expenses and direct incomes (status reset to `pending`); people are
  global, so clone **never** touches them.
- `custom` is the only expense figure used in totals; `amount`/`minimum` are reference.
- **Linking a person is invite + accept** — a person stays a one-sided local label until the real
  user behind it is invited by email and **accepts**; only then are accounts linked and a
  reciprocal person created on their side (`docs/business.md` §13). Never link without both sides'
  consent.
- **Linked charges/settlements auto-mirror with per-viewer sign** — recording once updates both
  tabs; the counterpart's copy renders with the sign flipped, and the two nets stay
  equal-and-opposite. Unlinked people are one-sided and unchanged.
- **Disputed items are parked, not deleted** — either side can dispute a linked charge/settlement;
  a disputed item is excluded from the confirmed net **and** from month totals (both sides) until
  resolved.
- **Privacy: only linked line items cross over** — the counterpart sees the shared person's
  charges/settlements and nothing else, never your whole month, other people, or dashboard.

## Definition of done (per change)

1. `go build ./...` and `go test ./...` pass.
2. `gofmt -w .` and `go vet ./...` clean.
3. New/changed business rules have table-driven tests (esp. `money` and `service/summary`).
4. Schema changes ship as a new `goose` migration (never edit an applied migration).
5. If a rule changed, `docs/business.md` / `docs/design.md` updated in the same change.

## Roadmap (build order)

- [ ] Migrations `0001_init` (schema from `docs/design.md` #3).
- [ ] `money` package + tests.
- [ ] `store` via sqlc: CRUD queries for all tables.
- [ ] `service`: get-month-with-summary, split, clone.
- [ ] `http`: routers + handlers for months, expenses, incomes, people, entries.
- [ ] CORS + config + `cmd/api` wiring.
- [ ] Frontend `api.ts` client; build panels; add per-person ledger UI.
- [ ] Deploy: Neon + Cloud Run (backend), Vercel (frontend).
