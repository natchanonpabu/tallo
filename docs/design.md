# design.md — Technical Design

Implements the rules in `business.md`. If the two disagree, `business.md` wins for *what*
the app does; this file owns *how*.

---

## 1. Architecture

```
┌─────────────┐      HTTPS/JSON      ┌──────────────┐      SQL       ┌──────────┐
│  Frontend   │  ───────────────────▶│  Go API      │ ──────────────▶│ Postgres │
│  Next.js    │◀───────────────────  │  (REST)      │◀────────────── │ (Neon)   │
│  on Vercel  │                       │ Cloud Run/   │                └──────────┘
└─────────────┘                       │ Render/Fly   │
                                      └──────────────┘
```

- **Frontend** — Next.js (App Router) on Vercel.
- **Backend** — a single Go service exposing a JSON REST API. All business logic
  (split, clone, dashboard totals) lives here, never in the frontend.
- **Database** — Postgres. Neon recommended: it auto-suspends compute and auto-resumes on
  connect, which suits an app opened roughly once a month. Supabase also works but its free
  tier *pauses* projects after 7 days of inactivity and needs a manual wake — worse fit here.
- **Backend hosting** — any Go-friendly host that scales to zero: Google Cloud Run
  (recommended), Render, or Fly.io. Expect a cold start on the first request after idle.

## 2. Money representation

**All money is stored and transported as `int64` satang** (1 baht = 100 satang). No floats
anywhere in the backend.

- DB column type: `bigint`.
- API: integers (e.g. `601000` means ฿6,010.00).
- Frontend converts for display only (`value / 100`, format with 2 decimals, th-TH locale).
- A small `money` package owns parsing, formatting, and the split rounding from
  `business.md` §8. Division never happens ad hoc in handlers.

## 3. Database schema

Postgres 14+. `gen_random_uuid()` is built in (pgcrypto). Enums keep statuses honest.

```sql
create type expense_status as enum ('pending', 'paid');
create type income_status  as enum ('pending', 'received');
create type person_status  as enum ('pending', 'settled');

-- optional in v1; wire real auth in phase 2
create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

create table months (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now()
);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references months(id) on delete cascade,
  grp        text   not null default '',
  name       text   not null default '',
  amount     bigint not null default 0,   -- satang, reference only
  minimum    bigint not null default 0,   -- satang, reference only
  custom     bigint not null default 0,   -- satang, THE figure used in totals
  status     expense_status not null default 'pending',
  position   int    not null default 0,
  created_at timestamptz not null default now()
);

create table incomes (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references months(id) on delete cascade,
  name       text   not null default '',
  amount     bigint not null default 0,   -- satang
  status     income_status not null default 'pending',
  position   int    not null default 0,
  created_at timestamptz not null default now()
);

create table people (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references months(id) on delete cascade,
  name       text   not null default '',
  status     person_status not null default 'pending',
  position   int    not null default 0,
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references people(id) on delete cascade,
  label             text   not null default '',
  amount            bigint not null,            -- signed satang: + owner paid, - they paid
  source_expense_id uuid references expenses(id) on delete set null,  -- traceability only
  created_at        timestamptz not null default now()
);

create index on months(user_id, created_at);
create index on expenses(month_id);
create index on incomes(month_id);
create index on people(month_id);
create index on ledger_entries(person_id);
```

**Derived, never stored:** a person's `net` (= `sum(ledger_entries.amount)`) and the five
dashboard totals. Compute them on read.

## 4. Computed values

```
person.net = Σ ledger_entries.amount            (per person)

paid       = Σ expense.custom  [status=paid]
           + Σ (-person.net)   [person.status=settled AND net<0]
toPay      = Σ expense.custom  [status=pending]
           + Σ (-person.net)   [person.status=pending AND net<0]
received   = Σ income.amount   [status=received]
           + Σ person.net      [person.status=settled AND net>0]
toReceive  = Σ income.amount   [status=pending]
           + Σ person.net      [person.status=pending AND net>0]
cashNow    = received - paid
```

Return these in the month payload so the frontend renders, never recomputes.

## 5. REST API

Base path `/api`. JSON in/out. Amounts are satang integers. All write responses return the
**full updated month** (§ GET month) so the frontend can replace state in one shot.

### Months
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/months` | — | list `{id,label,createdAt}` newest first |
| POST | `/api/months` | `{label}` | create empty month |
| GET | `/api/months/{id}` | — | full month (see payload below) |
| DELETE | `/api/months/{id}` | — | cascade-deletes everything in it |
| POST | `/api/months/{id}/clone` | `{label, expenseIds[], incomeIds[]}` | new cycle; carried items reset to pending; people not carried |

### Expenses
| Method | Path | Body |
|---|---|---|
| POST | `/api/months/{id}/expenses` | `{group?,name?,amount?,minimum?,custom?}` |
| PATCH | `/api/expenses/{id}` | any of `{group,name,amount,minimum,custom,status,position}` |
| DELETE | `/api/expenses/{id}` | — |
| POST | `/api/expenses/{id}/split` | see below |

### Incomes
| Method | Path | Body |
|---|---|---|
| POST | `/api/months/{id}/incomes` | `{name?,amount?}` |
| PATCH | `/api/incomes/{id}` | `{name,amount,status,position}` |
| DELETE | `/api/incomes/{id}` | — |

### People + ledger
| Method | Path | Body |
|---|---|---|
| POST | `/api/months/{id}/people` | `{name}` |
| PATCH | `/api/people/{id}` | `{name,status,position}` |
| DELETE | `/api/people/{id}` | — |
| POST | `/api/people/{id}/entries` | `{label?,amount}` (signed satang) |
| PATCH | `/api/entries/{id}` | `{label,amount}` |
| DELETE | `/api/entries/{id}` | — |

### GET month payload
```json
{
  "id": "…", "label": "มิ.ย. 69", "createdAt": "…",
  "expenses": [
    {"id":"…","group":"บัตร / สินเชื่อ","name":"KTC",
     "amount":0,"minimum":1272900,"custom":1272900,"status":"pending","position":0}
  ],
  "incomes": [
    {"id":"…","name":"เงินเดือน","amount":5335000,"status":"received","position":0}
  ],
  "people": [
    {"id":"…","name":"Person B","status":"pending","net":601000,
     "entries":[
       {"id":"…","label":"KTC","amount":947900,"sourceExpenseId":"…"},
       {"id":"…","label":"Durian","amount":-56000,"sourceExpenseId":null}
     ]}
  ],
  "summary": {"paid":270000,"toPay":1542900,"received":5335000,"toReceive":601000,"cashNow":5065000}
}
```

### Split request
```json
POST /api/expenses/{id}/split
// even
{"mode":"even","includeMe":true,
 "participants":[{"name":"Person A"},{"name":"Person B"}]}
// manual
{"mode":"manual",
 "participants":[{"name":"Person A","amount":500000},{"name":"Person B","amount":300000}]}
```
Server behaviour: for each participant, **find-or-create** a person with that name in this
month, then append a positive ledger entry (`label` = expense name, `sourceExpenseId` = the
expense). Even mode applies the §8 rounding; the owner is never given an entry. Returns the
updated month.

## 6. Backend layout (Go)

Stack: `net/http` + `chi` router, `pgx/v5` driver, `sqlc` for typed queries, `goose` for
migrations. Standard-library-first; no heavyweight framework.

Rooted at `tallo_service/` in the repo:

```
cmd/api/main.go            wire config, db pool, router, start server
internal/
  config/config.go         env: DATABASE_URL, PORT, CORS_ORIGIN
  money/money.go           satang type, format, SplitEven() rounding
  store/                    sqlc-generated code + queries.sql sources
  service/
    month.go               get-with-summary, clone
    split.go               split logic (find-or-create person, entries)
    summary.go             the five totals
  http/
    router.go              routes + CORS + JSON middleware
    months.go
    expenses.go
    incomes.go
    people.go
    errors.go              uniform error envelope {"error":{"code","message"}}
migrations/                goose SQL migrations (0001_init.sql, …)
sql/queries/               sqlc input .sql files
sqlc.yaml
go.mod
```

Rules:
- Handlers parse/validate and call a service. **No SQL and no money math in handlers.**
- `service` owns all business logic and transactions. Split and clone run in a single tx.
- `money` owns every division/rounding. Nothing else divides satang.

## 7. Frontend notes

- Keep the prototype's screen structure: dashboard strip, two panels (Expenses | Income),
  per-person ledger UI, split modal, new-cycle modal.
- Replace `window.storage` with a thin `api.ts` client. On any mutation, take the returned
  month and replace local state — the server already recomputed `net` and `summary`.
- Format money at the edge only: `฿${(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2})}`.
- The per-person ledger (Model A) is new vs the prototype: each person is a small card with
  add/edit/delete entries and a live net; the split modal writes into those cards.

## 8. Config & deployment

Backend env:
```
DATABASE_URL=postgres://…            # Neon connection string (use pooled URL)
PORT=8080
CORS_ORIGIN=https://your-app.vercel.app
```
Frontend env:
```
NEXT_PUBLIC_API_BASE=https://your-api.run.app/api
```
- CORS: allow only the Vercel origin; allow `GET,POST,PATCH,DELETE` + `Content-Type`.
- Neon: use the **pooled** connection string; set a small `pgxpool` max (e.g. 4) to stay
  friendly with serverless.
- Cloud Run: min instances 0 (accept cold starts), container from a small Go build.

## 9. Testing

- `money` package: unit tests for formatting and split rounding (esp. remainders, e.g.
  `custom=100`, `N=3` → shares `33,33,34`-equivalent with owner absorbing the remainder).
- `service`: table-driven tests for the five totals across pending/settled and positive/
  negative nets, and for clone (status reset, people not carried).
- One HTTP smoke test per resource (create → read → patch → delete).

## 10. Phase 2 (not now)

Real auth (owner login, `user_id` enforced), rate limiting, and optional export back to CSV.
Keep `users`/`user_id` in the schema now so adding auth later is non-breaking.
