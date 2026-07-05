# business.md — Monthly Money Tracker

Domain rules only. No tech. If a rule here conflicts with the code, this file wins —
fix the code. For schema, API, and stack see `design.md`.

---

## 1. What this app is

A per-month money tracker that replaces a Google Sheets workflow. Each month the owner
records what they have to **pay** and what they will **receive**, marks each item as it
actually happens, and sees how much cash is on hand right now.

It is **not** a running-balance accounting system. Each month starts from zero.

## 2. Core principles (non-negotiable)

- **A month is a closed box.** No balance is carried from the previous month. Opening a
  new month may *copy the list of items* forward, but never any amounts of "leftover cash".
- **Record once per month.** The owner opens the month, fills it in, and checks things off
  through the month. There is no daily ledger.
- **`custom` is the source of truth for money math.** Every expense carries three numbers —
  `amount`, `minimum`, `custom`. `amount` and `minimum` are *reference only* (they help the
  owner decide what to pay). Only `custom` is used in any total.
- **Cash moves only when the owner checks a box.** An expense affects cash when marked
  `paid`; income affects cash when marked `received`. An unchecked item is a plan, not money.

## 3. Glossary

- **Owner / "Me"** — the single person the whole sheet belongs to. All money is from their
  point of view.
- **Person** — someone the owner fronts money for or splits bills with (e.g. Person A, Person B,
  Person C). A person is scoped to one month; the same real-world person in two months is two
  separate person records.
- **Custom** — the actual amount the owner decides to pay this month for an expense.
- **Net** — the signed sum of a person's ledger for the month. Positive = they owe the owner.

## 4. The three buckets in a month

Every month contains exactly three kinds of things, kept separate:

1. **Expenses** — money going out that is *the owner's own* (cards, loans, bills, food).
2. **Incomes** — money coming in that is *directly the owner's* (salary, etc.). This bucket
   does **not** include money people pay back — that is derived from bucket 3.
3. **People (per-person ledgers)** — one sub-account per person. This is where "I paid for
   someone" and "they paid for me" live. Each person's net becomes a single receivable (or
   payable) that folds into the money picture.

## 5. Expenses

Fields: `group`, `name`, `amount`, `minimum`, `custom`, `status`.

- `group` is a free label used only to cluster rows visually (e.g. "บัตร / สินเชื่อ",
  "รายจ่ายอื่น"). It has no effect on math.
- `status` ∈ { `pending` (รอจ่าย), `paid` (จ่ายแล้ว) }.
- Only `custom` is summed. `amount` / `minimum` are reference values shown to the owner.

## 6. Incomes (direct)

Fields: `name`, `amount`, `status`.

- `status` ∈ { `pending` (รอรับ), `received` (รับแล้ว) }.
- Use for salary and any money that arrives without a per-person split.

## 7. People and the per-person ledger  ← the heart of the model

Each person has their own list of **ledger entries** for the month. Every entry has a
`label` and a **signed** `amount`:

- **Positive** = the owner paid on the person's behalf → the person owes the owner.
- **Negative** = the person paid on the owner's behalf → offsets what they owe.

The person's **net** = sum of all their entries. The net collapses into one line in the
money picture:

- **net > 0** → the person owes the owner → contributes to **receivables** (รอรับ / รับแล้ว).
- **net < 0** → the owner owes the person → contributes to **payables** (รอจ่าย / จ่ายแล้ว).
- **net = 0** → nothing to settle; ignored in totals.

Each person also has a `status` ∈ { `pending`, `settled` }:

- `pending` = not squared up yet → the net sits in **รอรับ** (if positive) or **รอจ่าย** (if negative).
- `settled` = squared up → the net moves into **รับแล้ว** (if positive) or **จ่ายแล้ว** (if negative).

> Worked example (Person B): entries `KTC +9,479`, `Shell +2,000`, `Durian −560`,
> `Fortuner −4,909` → net `+6,010`. While `pending` this shows as รอรับ ฿6,010. Tick
> `settled` and it becomes รับแล้ว ฿6,010.

## 8. Splitting a bill

Splitting is a convenience action **on an expense**. The expense stays in full in the
Expenses bucket (the owner really did pay the whole thing). Splitting only *writes entries
into people's ledgers* for the shares others owe.

Two modes:

- **Even** — pick who shares it (optionally including the owner). Each share = `custom ÷
  N`. A ledger entry (positive, `label` = the expense name) is written to every participant
  **except the owner**. The owner's own share stays absorbed in the expense.
- **Manual** — type each person's amount directly. Those become their ledger entries.

**Rounding rule (even split).** Work in satang (integer). Each non-owner share is
`floor(custom ÷ N)`. The owner absorbs the remainder so the numbers reconcile exactly:
`owner_share = custom − sum(other_shares)`. The owner already fronted the bill, so eating a
few satang of rounding is correct.

**Manual over/under.** Manual amounts are taken as given. If the entered shares exceed
`custom`, the owner's implied share goes negative — allowed, but the UI should surface it so
it isn't a silent mistake.

**After a split, the ledger entry is independent (snapshot).** See Decision D1.

## 9. The dashboard — five numbers

All amounts below use `custom` for expenses and `amount` for incomes, plus person nets.

- **จ่ายแล้ว (paid)** = Σ expenses where `status = paid`
  + Σ |net| of people where `status = settled` **and** `net < 0`.
- **รอจ่าย (to pay)** = Σ expenses where `status = pending`
  + Σ |net| of people where `status = pending` **and** `net < 0`.
- **รับแล้ว (received)** = Σ incomes where `status = received`
  + Σ net of people where `status = settled` **and** `net > 0`.
- **รอรับ (to receive)** = Σ incomes where `status = pending`
  + Σ net of people where `status = pending` **and** `net > 0`.
- **เงินตอนนี้ (cash now)** = `รับแล้ว − จ่ายแล้ว`.

There is **no starting-balance field**. Cash on hand originates from received income only.

## 10. Month lifecycle

- **Create month** — a named empty month (`label`, e.g. "ก.ค. 69"). Months are ordered by
  creation time; the label is display-only and can be anything.
- **Open new cycle (clone)** — create a new month by copying selected items from an existing
  month. The owner ticks which **expenses** and **direct incomes** to carry.
  - Carried items keep their names/amounts but reset `status` to `pending`.
  - **People and ledger entries are never carried** — they are month-specific by nature.
- **No auto-recurrence** beyond this explicit clone step.

## 11. Decisions log

- **D1 — Split entries are snapshots.** When a split writes an entry into a person's ledger,
  that entry holds a fixed amount. Editing the source expense later does **not** change it.
  To adjust, edit the ledger entry directly. The person's ledger is the source of truth for
  what they owe. (`source_expense_id` is kept for reference/traceability only.)
- **D2 — Negative net becomes a payable.** A person whose net is negative is money the owner
  owes them, and flows into จ่ายแล้ว / รอจ่าย, not the receivable side.
- **D3 — No carried cash.** Confirmed: months never inherit leftover cash. Cash now =
  received − paid, from zero, every month.
- **D4 — Model A (per-person ledgers).** Chosen over a flat list of receivables, to support
  offsetting entries (someone paying the owner back in advance) exactly like the sheet does.

## 12. Out of scope for v1

Multi-currency; interest/APR calculators on cards; analytics across months; budgets/targets;
notifications; shared/multi-user editing of the same month. Auth is optional in v1 (single
owner) and specified as phase 2 in `design.md`.
