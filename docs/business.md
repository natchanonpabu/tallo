# business.md — Monthly Money Tracker

Domain rules only. No tech. If a rule here conflicts with the code, this file wins —
fix the code. For schema, API, and stack see `design.md`.

---

## 1. What this app is

A per-month money tracker that replaces a Google Sheets workflow. Each month the owner
records what they have to **pay** and what they will **receive**, marks each item as it
actually happens, and sees the **net money that moved this month** — what came in minus what
went out.

It is **not** a running-balance accounting system and **not** a mirror of your bank balance.
Each month starts from zero: the app tracks *this month's flow and settlements*, never the
cash you were already holding. Your real balance lives in your bank — read it there.

## 2. Core principles (non-negotiable)

- **A month is a closed box.** No balance is carried from the previous month. Opening a
  new month may *copy the list of items* forward, but never any amounts of "leftover cash".
- **Record once per month.** The owner opens the month, fills it in, and checks things off
  through the month. There is no daily ledger.
- **`custom` is the source of truth for money math.** Every expense carries three numbers —
  `amount`, `minimum`, `custom`. `amount` and `minimum` are *reference only* (they help the
  owner decide what to pay). Only `custom` is used in any total.
- **Cash moves only when the owner records it.** An expense affects cash when marked `paid`;
  income when marked `received`; a person's balance when a **settlement** is recorded. An
  unchecked item — or an unsettled person balance — is a plan/IOU, not this month's cash.

## 3. Glossary

- **Owner / "Me"** — the single person the whole sheet belongs to. All money is from their
  point of view.
- **Person** — someone the owner fronts money for or splits bills with (e.g. Person A, Person B,
  Person C). A person is **global**, not tied to a month: one real-world person is one record
  whose ledger runs across every month (D6).
- **Custom** — the actual amount the owner decides to pay this month for an expense.
- **Net** — the signed **running** balance of a person's ledger (charges minus what's been
  settled), across all months. Positive = they owe the owner; negative = the owner owes them;
  zero = square.
- **Charge** — a ledger entry that changes what a person owes (e.g. a split share). Moves the
  running balance only; **not** a cash event, touches no month's dashboard.
- **Settlement** — the moment money actually changes hands to square up (all or part of) a
  balance. Belongs to the month it happens in and **is** a cash event there (D6).

## 4. The three buckets

The app tracks three kinds of things, kept separate. The first two are **per-month**; the third
is **global** and spans months:

1. **Expenses** (per month) — money going out that is *the owner's own* (cards, loans, bills,
   food).
2. **Incomes** (per month) — money coming in that is *directly the owner's* (salary, etc.). This
   bucket does **not** include money people pay back — that lives in bucket 3.
3. **People (per-person ledgers)** (global, cross-month) — one running sub-account per person,
   living **outside** the monthly boxes (#3, D6). Where "I paid for someone" and "they paid for
   me" accumulate as a running tab. A person's open balance shows in its own People section and
   does **not** fold into any month's four tiles; only a **settlement** — cash actually changing
   hands (§7) — lands in the flow of the month it happens in.

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

A person is a **global running account** (#3, D6), not reset per month. Their ledger holds two
kinds of records: **charges** (what they owe) and **settlements** (money actually moving).

**Charges** — each has a `label` and a **signed** `amount`:

- **Positive** = the owner paid on the person's behalf → the person owes the owner more.
- **Negative** = the person paid on the owner's behalf → offsets what they owe.

A charge only moves the running balance; it is **not** a cash event and touches no month's
dashboard. (Fronting money for someone is treated as a future receivable, not this-month cash —
§1, §9.)

**Settlements** — the moment money actually changes hands to square up. A settlement records an
`amount` and the **month** it happened in. It reduces the running balance toward zero **and** is
a cash event in that month (D6):

- a person pays the owner → **รับแล้ว** in that month;
- the owner pays a person → **จ่ายแล้ว** in that month.

The person's **running net** = Σ charges − Σ settlements:

- **net > 0** → the person owes the owner → a **receivable**, shown in the People section.
- **net < 0** → the owner owes the person → a **payable**, shown in the People section.
- **net = 0** → square; nothing outstanding.

> Worked example (Person B). Charges over time: `KTC +9,479`, `Shell +2,000`, `Durian −560`,
> `Fortuner −4,909` → running net `+6,010` (they owe the owner ฿6,010), shown in the People
> section — it does **not** touch any month's tiles yet. In August the owner records a
> settlement of `฿6,010` in the August month: August's **รับแล้ว** rises ฿6,010 (real cash in),
> and Person B's running net drops to `0`.

## 8. Splitting a bill

Splitting is a convenience action **on an expense**. The expense stays in full in the
Expenses bucket (the owner really did pay the whole thing). Splitting only *writes charges into
people's ledgers* (§7) for the shares others owe — it never creates a settlement, so it moves
running balances, not this month's cash. People are matched or created **globally by name**
(#3), so splitting in any month adds to the same person's running tab.

Two modes:

- **Even** — pick who shares it (optionally including the owner). Each share = `custom ÷
  N`. A charge (positive, `label` = the expense name) is written to every participant
  **except the owner**. The owner's own share stays absorbed in the expense.
- **Manual** — type each person's amount directly. Those become their charges.

**Rounding rule (even split).** Work in satang (integer). Each non-owner share is
`floor(custom ÷ N)`. The owner absorbs the remainder so the numbers reconcile exactly:
`owner_share = custom − sum(other_shares)`. The owner already fronted the bill, so eating a
few satang of rounding is correct.

**Manual over/under.** Manual amounts are taken as given. If the entered shares exceed
`custom`, the owner's implied share goes negative — allowed, but the UI should surface it so
it isn't a silent mistake.

**After a split, the charge is independent (snapshot).** See Decision D1.

## 9. The dashboard — five numbers

All amounts use `custom` for expenses, `amount` for incomes, and **settlements** for people.
Open person balances are **not** here — they live in the People section (below).

- **จ่ายแล้ว (paid)** = Σ expenses where `status = paid`
  + Σ settlements **in this month** where the owner paid a person.
- **รอจ่าย (to pay)** = Σ expenses where `status = pending`.
- **รับแล้ว (received)** = Σ incomes where `status = received`
  + Σ settlements **in this month** where a person paid the owner.
- **รอรับ (to receive)** = Σ incomes where `status = pending`.
- **สุทธิเดือนนี้ (net this month)** = `รับแล้ว − จ่ายแล้ว`.

This is the **net cash that moved this month, from zero** — money marked received (incl.
settlements a person paid you this month) minus money marked paid (incl. settlements you paid a
person this month). It is deliberately **not** your real cash-on-hand: there is **no
starting-balance field** (D3), so it ignores whatever you were already holding on the 1st. A
negative value means you paid out more than you took in *this month*, not that you're broke —
check your bank for the true balance.

### The People section (global, alongside the months)

Separate from any month, two running totals summarise all people (§7):

- **รวมที่คนติดเรา (owed to you)** = Σ `net` of people where `net > 0`.
- **รวมที่เราติดคน (you owe)** = Σ `|net|` of people where `net < 0`.

These are "as of now" across all months. An open balance sits here quietly; recording a
**settlement** is what moves money into a specific month's รับแล้ว / จ่ายแล้ว above.

## 10. Month lifecycle

- **Create month** — a named empty month (`label`, e.g. "ก.ค. 69"). Months are ordered by
  creation time; the label is display-only and can be anything.
- **Open new cycle (clone)** — create a new month by copying selected items from an existing
  month. The owner ticks which **expenses** and **direct incomes** to carry.
  - Carried items keep their names/amounts but reset `status` to `pending`.
  - **People are not involved in clone at all** — they are global and span months by nature
    (§7, D6), so there is nothing month-specific to carry.
- **No auto-recurrence** beyond this explicit clone step.

## 11. Decisions log

- **D1 — Split entries are snapshots.** When a split writes an entry into a person's ledger,
  that entry holds a fixed amount. Editing the source expense later does **not** change it.
  To adjust, edit the ledger entry directly. The person's ledger is the source of truth for
  what they owe. (`source_expense_id` is kept for reference/traceability only.)
- **D2 — Negative net is a payable (shown in People, settled into a month).** A person whose
  running net is negative is money the owner owes them. It shows as a payable in the People
  section; it enters a month's **จ่ายแล้ว** only when the owner records a settlement paying them
  (D6). (Supersedes the old rule that folded pending negative nets straight into รอจ่าย.)
- **D3 — No carried cash (it's a flow, not a balance).** Months never inherit leftover cash.
  `สุทธิเดือนนี้ = received − paid`, from zero, every month. This deliberately makes the
  headline a *monthly cash-flow* figure, not a bank balance — a month is a closed box. The app
  never claims to know your real cash-on-hand; #1 and #9 say so out loud. (Revised: the number
  was previously mislabelled "เงินตอนนี้ / cash now", which implied a balance it never was.)
- **D4 — Model A (per-person ledgers).** Chosen over a flat list of receivables, to support
  offsetting entries (someone paying the owner back in advance) exactly like the sheet does. The
  ledgers are now global (D6).
- **D5 — ~~Debts are month-scoped~~ (superseded by D6).** Originally a person and their ledger
  lived in one month and unsettled debts were not carried. Reversed: real interpersonal debts
  span months, so people are now global — see D6.
- **D6 — People are a global cross-month ledger; settlements are the cash events.** A person is
  one record whose ledger runs across all months (#3, #4, #7). **Charges** move the running
  balance only; a **settlement** (all or part of the balance) is a cash event in the month it
  happens, landing in that month's **รับแล้ว** (they paid you) or **จ่ายแล้ว** (you paid them).
  Open balances live in the People section, never in a month's four tiles. Chosen so a friend's
  running tab and the monthly cash flow are both correct: the tab persists across months, and
  money hits a month only when it actually moves. (Replaces D2's old folding rule and D5.)
- **D7 — Multi-user with invite/accept linked debts.** Tallo becomes multi-user: everyone signs
  in and owns their own months, expenses, incomes, and people (all data scoped per user). A
  person label may be **linked** to another real user only through **invite + accept** — the
  inviter invites by email, the invitee accepts, and only then are the accounts linked, with a
  reciprocal person created on the invitee's side. Linked charges and settlements **auto-mirror**
  to the counterpart with the **sign flipped per viewer**; either side may **dispute** an item,
  which excludes it from the confirmed net and from month totals until resolved. The counterpart
  sees only the linked line items, never the whole month. This deliberately **reverses** the old
  single-owner assumption and the §12 "no shared/multi-user editing" stance (see §13). Auth is
  now required in v1 — email + password only; Google OAuth / magic-link are left possible but
  not built.

## 12. Out of scope for v1

Multi-currency; interest/APR calculators on cards; analytics across months; budgets/targets;
notifications; an opening-balance / real cash-on-hand view (the headline is a monthly flow —
D3). Login is now **required** — Tallo is multi-user (email + password); see §13 and
`design.md` §3/§5/§10. Google OAuth and magic-link remain possible in the schema but are **not**
built in v1.

## 13. Multi-user & linked debts

Tallo is now **multi-user**. Everyone signs in and owns their own months, expenses, incomes, and
people — every screen is scoped to the signed-in user, and one user never sees another's month.
Two users can, however, agree to **link** a shared debt so both sides see the same running tab,
each from their own point of view.

**Login.** Access requires an account (email + password); there is no anonymous / single-owner
mode anymore. Everything a user records lives under their account and is private to them by
default.

**Linking a person to a real user (invite + accept).** A **person** (§3) is normally a one-sided
local label — a name on the owner's ledger, meaning nothing to anyone else. The owner may
**invite** the real person behind a label to link accounts, by email. The invite does nothing to
the ledgers until the other user **accepts**. On accept, the two accounts are linked and a
**reciprocal person** is created on the invitee's side pointing back at the inviter; a decline
leaves both sides untouched. Consent is required from both ends — you can never attach yourself
to someone's ledger without them agreeing.

**Two-sided auto-mirror (per-viewer sign).** Once a person is linked, every **charge** and
**settlement** that references that person is automatically **mirrored** onto the counterpart's
matching person. The mirror is the same event seen from the other side, so its **sign is flipped
per viewer**: a `+560` charge (they owe you) shows on their side as `−560` (from their seat, money
they owe out — a payable of 560). Neither side re-enters anything; recording once updates both
tabs, and the two running nets stay equal-and-opposite.

**Dispute.** Either side may **dispute** a mirrored charge or settlement (e.g. "that's not my
share"). A disputed item is **excluded from the confirmed net** — and therefore from any month
totals it would otherwise touch — for *both* sides until it is **resolved**. Resolving restores
it to the net. Disputes never silently change an amount; they only park an item out of the totals
until the two people agree.

**Privacy.** Linking shares **only the linked line items**, never the whole month. The
counterpart sees the charges and settlements on the shared person and nothing else — not your
expenses, incomes, other people, or dashboard.

**Unlinked people are unchanged.** A person you never link stays a one-sided local label that
behaves exactly as §7 describes: your ledger only, no mirror, no counterpart, no dispute. Linking
is opt-in, per person.
