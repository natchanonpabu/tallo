# design.md — Technical Design

Implements the rules in `business.md`. If the two disagree, `business.md` wins for _what_
the app does; this file owns _how_.

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
  tier _pauses_ projects after 7 days of inactivity and needs a manual wake — worse fit here.
- **Backend hosting** — any Go-friendly host that scales to zero: Google Cloud Run
  (recommended), Render, or Fly.io. Expect a cold start on the first request after idle.

## 2. Money representation

**All money is stored and transported as `int64` satang** (1 baht = 100 satang). No floats
anywhere in the backend.

- DB column type: `bigint`.
- API: integers (e.g. `601000` means ฿6,010.00).
- Frontend converts for display only (`value / 100`, format with 2 decimals, th-TH locale).
- A small `money` package owns parsing, formatting, and the split rounding from
  `business.md` #8. Division never happens ad hoc in handlers.

## 3. Database schema

Postgres 14+. `gen_random_uuid()` is built in (pgcrypto). Enums keep statuses honest.

Enums keep statuses honest. People no longer carry a status — a person is a global running
account (business.md D6); their balance is derived, and "settling" is an explicit event, not a
flag.

**Multi-user in v1 (business.md §13, D7).** Auth is now email + password (bcrypt) with a session
cookie — no longer phase 2. Every user owns their own rows, so `months.user_id` and
`people.user_id` become **NOT NULL** (backfilled and enforced by migration `0003_auth`, since
existing rows predate multi-user). Linking (`people.linked_user_id`, `link_requests`) and the
mirror/dispute columns (`counterpart_user_id`, `disputed`) arrive in `0004`/`0005`. Google OAuth
and magic-link are left possible by this schema but are **not** built in v1.

```sql
create type expense_status      as enum ('pending', 'paid');
create type income_status       as enum ('pending', 'received');
create type link_request_status as enum ('pending', 'accepted', 'declined');

-- v1 auth: email + password (bcrypt). Google OAuth / magic-link are intentionally
-- NOT built now; the schema just leaves room to add them later (extra columns or an
-- auth-identities table) without breaking this one.
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,                 -- bcrypt; never returned by the API
  created_at    timestamptz not null default now()
);

-- Server-side sessions keyed by an opaque cookie token. Alternative: a signed JWT in
-- an httpOnly cookie and no table at all — pick one; the REST contract (§5) is the same.
create table sessions (
  token      text primary key,                 -- opaque random; sent as an httpOnly cookie
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table months (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,  -- NOT NULL from 0003 (backfill first)
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

-- People are GLOBAL (no month_id): one record per real-world person, ledger runs
-- across all months (business.md D6).
create table people (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,  -- NOT NULL from 0003 (backfill first)
  name           text   not null default '',
  linked_user_id uuid references users(id) on delete set null,  -- null = one-sided local label; set once an invite is accepted (0004)
  position       int    not null default 0,
  created_at     timestamptz not null default now()
);

-- Charges: what a person owes. Signed satang, running balance only, NOT a cash event.
create table ledger_entries (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references people(id) on delete cascade,
  label               text   not null default '',
  amount              bigint not null,            -- + owner paid on their behalf, - they paid for owner
  source_expense_id   uuid references expenses(id) on delete set null,  -- traceability only
  counterpart_user_id uuid references users(id) on delete set null,     -- linked people: the mirrored copy lives on this user's side (0005)
  disputed            boolean not null default false,                   -- true = parked out of net + month totals until resolved (0005)
  created_at          timestamptz not null default now()
);

-- Settlements: money actually changing hands. A cash event in month_id; reduces the
-- running balance. Signed satang: + person paid the owner (received in month_id),
-- - owner paid the person (paid in month_id).
create table settlements (
  id                  uuid   primary key default gen_random_uuid(),
  person_id           uuid   not null references people(id) on delete cascade,
  month_id            uuid   not null references months(id) on delete cascade,
  label               text   not null default '',
  amount              bigint not null,
  counterpart_user_id uuid references users(id) on delete set null,     -- linked mirror lives on this user's side (0005)
  disputed            boolean not null default false,                   -- excluded from net + month totals until resolved (0005)
  created_at          timestamptz not null default now()
);

-- Invite + accept: linking a local person label to a real user. On accept the two accounts
-- link (people.linked_user_id set on both sides) and a reciprocal person is created on the
-- invitee's side (business.md §13, D7). Added in 0004.
create table link_requests (
  id             uuid primary key default gen_random_uuid(),
  from_user_id   uuid not null references users(id) on delete cascade,   -- the inviter
  from_person_id uuid not null references people(id) on delete cascade,  -- the local label being linked
  to_email       text not null,                                          -- invited by email
  to_user_id     uuid references users(id) on delete cascade,            -- resolved once the invitee has/accepts an account
  status         link_request_status not null default 'pending',
  created_at     timestamptz not null default now()
);

create index on months(user_id, created_at);
create index on expenses(month_id);
create index on incomes(month_id);
create index on people(user_id, position);
create index on people(linked_user_id);
create index on ledger_entries(person_id);
create index on ledger_entries(counterpart_user_id);
create index on settlements(person_id);
create index on settlements(month_id);
create index on settlements(counterpart_user_id);
create index on sessions(user_id);
create index on link_requests(to_email);
create index on link_requests(to_user_id);
create index on link_requests(from_user_id);
```

**Derived, never stored:** a person's running `net` (= `Σ ledger_entries.amount −
Σ settlements.amount`), the two People-section totals, and the five dashboard totals. Compute
them on read.

## 4. Computed values

All sums below are over the signed-in user's own rows, and **disputed items are excluded**
(`disputed=false`) until they are resolved (business.md §13). Unlinked people never have disputed
items, so their math is unchanged.

```
# Per person (global, running across all months); disputed items excluded:
person.net = Σ ledger_entries.amount − Σ settlements.amount   [disputed=false]

# Per month M — people contribute ONLY via settlements dated to M (business.md D6):
paid       = Σ expense.custom          [status=paid,     month=M]
           + Σ |settlement.amount|      [amount<0,        month=M, disputed=false]  # owner paid a person
toPay      = Σ expense.custom          [status=pending,  month=M]
received   = Σ income.amount           [status=received, month=M]
           + Σ settlement.amount        [amount>0,        month=M, disputed=false]  # a person paid the owner
toReceive  = Σ income.amount           [status=pending,  month=M]
cashNow    = received − paid           # net flow THIS MONTH (label: สุทธิเดือนนี้)

# People section (global, not tied to any month):
owedToYou  = Σ person.net              [net>0]
youOwe     = Σ (−person.net)           [net<0]
```

**Disputed items are parked.** A `disputed=true` charge or settlement drops out of the confirmed
`net` and out of every month total it would touch, on **both** linked sides, until it is resolved
(business.md §13). Resolving flips `disputed` back to `false` and the item re-enters the sums.

**Linked entries are per-viewer.** A charge/settlement on a linked person is stored once and
mirrored to the counterpart; each side renders it with the **sign flipped** for its own point of
view (business.md §13, D7). `net` on each side is still `Σ charges − Σ settlements`, and the two
nets come out equal-and-opposite.

Return the five month totals in the month payload and the two People totals in the people
payload, so the frontend renders, never recomputes. Open person balances **never** appear in a
month's toPay/toReceive — only settlements move money into a month.

> **`cashNow` is a monthly flow, not cash-on-hand.** The JSON key stays `cashNow` (kept stable
> — no schema/API change), but its user-facing label is **สุทธิเดือนนี้ (net this month)**. There
> is no opening balance by design, so it is `received − paid` from zero every month, never your
> real bank balance (business.md #1, #9, D3).

## 5. REST API

Base path `/api`. JSON in/out. Amounts are satang integers. There are **two aggregates**, and a
write replaces whichever it changes:

- **Month** — `{id,label,createdAt,expenses[],incomes[],settlements[],summary}`. Expense/income
  writes return the month.
- **People** — `{people:[{id,name,net,position,entries[]}],totals:{owedToYou,youOwe}}`. Person,
  charge, and split writes return the people aggregate.
- A **settlement** touches a month *and* a person, so it returns `{month, people}`.

**Auth is required and everything is user-scoped (business.md §13).** Every `/api` route except
`POST /api/auth/signup` and `POST /api/auth/login` requires a valid session cookie and only ever
touches the signed-in user's own rows. A request for another user's month, person, entry, or
settlement returns **404** (not 403 — don't reveal that the row exists).

### Auth  (email + password; session cookie)

| Method | Path               | Body                | Notes                                                    |
| ------ | ------------------ | ------------------- | -------------------------------------------------------- |
| POST   | `/api/auth/signup` | `{email, password}` | create account (bcrypt the password), start a session    |
| POST   | `/api/auth/login`  | `{email, password}` | verify, set the httpOnly session cookie                  |
| POST   | `/api/auth/logout` | —                   | clear the session                                        |
| GET    | `/api/auth/me`     | —                   | `{id, email}` of the signed-in user, else 401            |

Email + password only in v1. Google OAuth and magic-link are deliberately **not** built now; the
schema (§3) leaves room to add them without breaking this contract.

### Months

| Method | Path                     | Body                                 | Notes                                                         |
| ------ | ------------------------ | ------------------------------------ | ------------------------------------------------------------- |
| GET    | `/api/months`            | —                                    | list `{id,label,createdAt}` newest first                      |
| POST   | `/api/months`            | `{label}`                            | create empty month                                            |
| GET    | `/api/months/{id}`       | —                                    | full month (see payload below)                                |
| DELETE | `/api/months/{id}`       | —                                    | cascade-deletes everything in it                              |
| POST   | `/api/months/{id}/clone` | `{label, expenseIds[], incomeIds[]}` | new cycle; carried items reset to pending; people are global (untouched) |

### Expenses

| Method | Path                        | Body                                                        |
| ------ | --------------------------- | ----------------------------------------------------------- |
| POST   | `/api/months/{id}/expenses` | `{group?,name?,amount?,minimum?,custom?}`                   |
| PATCH  | `/api/expenses/{id}`        | any of `{group,name,amount,minimum,custom,status,position}` |
| DELETE | `/api/expenses/{id}`        | —                                                           |
| POST   | `/api/expenses/{id}/split`  | see below — returns the **people** aggregate                |

### Incomes

| Method | Path                       | Body                            |
| ------ | -------------------------- | ------------------------------- |
| POST   | `/api/months/{id}/incomes` | `{name?,amount?}`               |
| PATCH  | `/api/incomes/{id}`        | `{name,amount,status,position}` |
| DELETE | `/api/incomes/{id}`        | —                               |

### People, charges, settlements  (global — **not** nested under a month)

These return the **people aggregate**, except settlements, which return `{month, people}`.

| Method | Path                           | Body                                        | Notes                               |
| ------ | ------------------------------ | ------------------------------------------- | ----------------------------------- |
| GET    | `/api/people`                  | —                                           | all people + running nets + totals  |
| POST   | `/api/people`                  | `{name}`                                    | create a global person              |
| PATCH  | `/api/people/{id}`             | `{name,position}`                           | no status field anymore             |
| DELETE | `/api/people/{id}`             | —                                           | removes their charges + settlements |
| POST   | `/api/people/{id}/entries`     | `{label?,amount}` (signed satang)           | add a **charge** (balance only)     |
| PATCH  | `/api/entries/{id}`            | `{label,amount}`                            | edit a charge                       |
| DELETE | `/api/entries/{id}`            | —                                           | delete a charge                     |
| POST   | `/api/people/{id}/settlements` | `{monthId, amount, label?}` (signed satang) | cash event → `{month, people}`      |
| DELETE | `/api/settlements/{id}`        | —                                           | undo → `{month, people}`            |

Settlement `amount`: **positive** = the person paid the owner (→ `received` in `monthId`);
**negative** = the owner paid the person (→ `paid` in `monthId`). Either way it reduces the
running net toward zero.

### Linking & disputes  (business.md §13)

Linking a person to a real user is **invite + accept**; once linked, charges/settlements
auto-mirror to the counterpart (per-viewer sign) and either side may dispute an item.

| Method | Path                              | Body      | Notes                                                                    |
| ------ | --------------------------------- | --------- | ------------------------------------------------------------------------ |
| POST   | `/api/people/{id}/link-request`   | `{email}` | invite the real user behind this label; creates a pending request         |
| GET    | `/api/link-requests`              | —         | requests I sent + requests addressed to me                               |
| POST   | `/api/link-requests/{id}/accept`  | —         | link accounts; set `linked_user_id` both sides + create reciprocal person |
| POST   | `/api/link-requests/{id}/decline` | —         | leave both sides untouched                                               |
| POST   | `/api/entries/{id}/dispute`       | —         | flag a linked charge → excluded from net + month totals                  |
| POST   | `/api/entries/{id}/resolve`       | —         | clear the dispute → charge re-enters the sums                            |
| POST   | `/api/settlements/{id}/dispute`   | —         | flag a linked settlement → excluded from its month + net                 |
| POST   | `/api/settlements/{id}/resolve`   | —         | clear the dispute                                                        |

Accepting a request returns the **people** aggregate (both the now-linked person and the new
reciprocal person appear). Dispute/resolve on an **entry** returns the people aggregate; on a
**settlement** returns `{month, people}` (a settlement touches a month). A mirror action taken by
one side is reflected on the other side's next read — the server owns both copies, and dispute is
symmetric (either side can raise or resolve it).

### GET month payload

```json
{
  "id": "…",
  "label": "มิ.ย. 69",
  "createdAt": "…",
  "expenses": [
    {
      "id": "…",
      "group": "บัตร / สินเชื่อ",
      "name": "KTC",
      "amount": 0,
      "minimum": 1272900,
      "custom": 1272900,
      "status": "pending",
      "position": 0
    }
  ],
  "incomes": [
    {
      "id": "…",
      "name": "เงินเดือน",
      "amount": 5335000,
      "status": "received",
      "position": 0
    }
  ],
  "settlements": [
    { "id": "…", "personId": "…", "personName": "Person B",
      "label": "เคลียร์เต็ม", "amount": 891900 }
  ],
  "summary": {
    "paid": 270000,
    "toPay": 1542900,
    "received": 6226900,
    "toReceive": 601000,
    "cashNow": 5956900
  }
}
```

The month payload no longer contains `people` — people are global (see below). `settlements`
here are the ones dated to this month and are already folded into `summary` (the `+891900`
settlement is inside `received`).

### GET people payload  (`GET /api/people`)

```json
{
  "people": [
    {
      "id": "…",
      "name": "Person B",
      "net": 0,
      "position": 0,
      "entries": [
        { "id": "…", "label": "KTC", "amount": 947900, "sourceExpenseId": "…" },
        { "id": "…", "label": "Durian", "amount": -56000, "sourceExpenseId": null }
      ]
    }
  ],
  "totals": { "owedToYou": 0, "youOwe": 0 }
}
```

`net` is the running balance (Σ charges − Σ settlements) across all months, **excluding disputed
items**; `entries` are the **charges** only. Here Person B's two charges sum to `891900`, and the
`891900` settlement above brings the running net to `0`. A linked person also carries
`linkedUserId`, and each charge/settlement carries `disputed` (bool) so the frontend can badge a
linked person and mark a parked item — the amount is already left out of `net` while `disputed`.

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

Server behaviour: for each participant, **find-or-create a global person** with that name (not
scoped to a month), then append a positive **charge** (`label` = expense name, `sourceExpenseId`
= the expense). Even mode applies the #8 rounding; the owner is never given a charge. A split
moves running balances only (no cash event), so it **returns the people aggregate**, not a month.

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
    month.go               get-with-summary (month aggregate), clone
    split.go               split logic (find-or-create GLOBAL person, charges)
    people.go              people aggregate, charges, settlements
    summary.go             the five month totals + People-section totals
    auth.go                signup/login (bcrypt), session issue/verify
    linking.go             link-request invite/accept/decline, mirror, dispute/resolve
  http/
    router.go              routes + CORS + JSON middleware
    auth.go                auth endpoints + session-cookie middleware (user_id in context)
    months.go
    expenses.go
    incomes.go
    people.go              people, charges, settlements (global, not under a month)
    linking.go             link-request + dispute endpoints
    errors.go              uniform error envelope {"error":{"code","message"}}
migrations/                goose SQL migrations (0001_init.sql, 0002_people_global.sql,
                           0003_auth.sql, 0004_linking.sql, 0005_mirror_dispute.sql, …)
sql/queries/               sqlc input .sql files
sqlc.yaml
go.mod
```

Rules:

- Handlers parse/validate and call a service. **No SQL and no money math in handlers.**
- `service` owns all business logic and transactions. Split, clone, and settle run in a single tx.
- `money` owns every division/rounding. Nothing else divides satang.
- People are **global** (no `month_id`); only settlements tie a person to a month's cash flow.
- **Every service call is user-scoped:** the session middleware puts the `user_id` in context, and
  handlers pass it down; queries always filter by it (business.md §13). Accept/mirror/dispute cross
  the user boundary deliberately and run in a single tx that writes both linked sides.
- **Migrations layer up in order.** `0001_init` (business.md #1–#12 schema), `0002_people_global`
  (Model B — people go global; **not yet coded**), then this change: `0003_auth`
  (`password_hash` + `sessions`, backfill and enforce `user_id` NOT NULL on months/people),
  `0004_linking` (`people.linked_user_id`, `link_requests`), `0005_mirror_dispute`
  (`counterpart_user_id` + `disputed` on `ledger_entries` and `settlements`). Never edit an
  applied migration.

## 7. Frontend notes

- Screen structure: dashboard strip + two panels (Expenses | Income) for the current month,
  plus a **global People section** (cross-month, shown alongside the months), the split modal,
  the settle modal, and the new-cycle modal.
- Replace `window.storage` with a thin `api.ts` client. Hold **two** states — the month and the
  people aggregate — and on any mutation replace whichever the response carries (a settlement
  carries both). The server recomputes `net`, `summary`, and the People totals.
- Format money at the edge only: `฿${(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2})}`.
- The per-person ledger (Model A, now global — D6): each person is a card with charges
  (add/edit/delete) and a live running net; the split modal writes charges into those cards, and
  a **settle** action records a cash event into a chosen month.

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
- `service`: table-driven tests for the five month totals — that open person balances do **not**
  appear, and that settlements land in `paid`/`received` of their month (both directions); that
  a person's running net = `Σ charges − Σ settlements` across months; and clone (status reset,
  people untouched).
- One HTTP smoke test per resource (create → read → patch → delete), plus the cross-cutting
  flow: split (charge) → settle (cash event moves a month + zeroes the tab).

## 10. Later (not in v1)

Rate limiting and optional export back to CSV.

**Auth is no longer here — it moved into v1.** Owner login and `user_id` enforcement (email +
password + session cookie, every query scoped by user) are part of this version; see §3, §4, §5,
and business.md §13/D7. Google OAuth and magic-link sign-in are deliberately left possible by the
schema (§3) but are **not** built now — v1 is email + password only, so those remain future work.
