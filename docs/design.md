# Tallo — Technical Design (ร่างแรก)

> สถานะ: **Draft v0.1** · 2026-10-19
> กฎธุรกิจอยู่ที่ [business.md](business.md) (ถ้าขัดกัน ให้ยึด business.md) · stack และหน้าตาอยู่ที่ [frontend.md](frontend.md)

---

## 1. ภาพรวม

```
React (Vite) ──supabase-js──▶ Supabase
                               ├─ Auth            (สมัคร/เข้าสู่ระบบ)
                               ├─ Postgres + RLS  (ข้อมูลทั้งหมด, สิทธิ์บังคับที่ DB)
                               ├─ RPC (plpgsql)   (logic ที่ข้าม user หรือต้อง atomic)
                               ├─ Realtime        (แจ้งเตือนในแอป)
                               ├─ pg_cron         (เตือนวันครบกำหนดรายวัน)
                               └─ Storage         (สลิป/รูปบิล — ระยะถัดไป)
```

- **ไม่มี server ของเราเอง** frontend คุยกับ Supabase ตรง
- **ข้อมูลของตัวเอง** (เดือน, รายการ, รายการย่อย, หักกลบ) เขียนผ่าน table ได้ตรง แล้ว RLS จำกัดให้เห็นแค่ของตัวเอง
- **ทุกอย่างที่ข้าม user หรือมี state machine** (ส่งยอด, ยืนยัน, จ่ายแล้ว) และการคำนวณส่วนแบ่ง ทำผ่าน **RPC** เท่านั้น client ไม่มีสิทธิ์ update table เหล่านี้ตรง
- Migration อยู่ที่ `supabase/migrations/` (root ของ repo) ใช้ Supabase CLI รัน local ด้วย Docker

### Local development

ต้องมี Supabase CLI (`brew install supabase/tap/supabase`) และ Docker Desktop (`brew install --cask docker-desktop`) และต้องเปิด Docker Desktop ไว้ก่อนรัน `supabase start`

```sh
supabase start        # เปิด stack บนเครื่อง (Studio: http://127.0.0.1:54323)
supabase db reset     # ล้างฐานข้อมูลแล้วรัน migration ทั้งหมดใหม่
supabase test db      # รันเทสต์ pgTAP ใน supabase/tests/
supabase stop
```

`tallo_app/.env.local` ชี้ไปที่ `http://127.0.0.1:54321` และใช้ publishable key ของเครื่อง (ดูได้จาก `supabase status`)

Error ที่ frontend ต้องจับ: `month_closed`, `cannot_link_self`, `friend_code_not_found`, `contact_not_found` (มาใน `error.message`)

## 2. หลักการข้อมูล

| หลักการ | รายละเอียด |
|---|---|
| **เงินเป็นสตางค์** | ทุกคอลัมน์เงินเป็น `bigint` หน่วยสตางค์ (26,938.48 บาท = `2693848`) ฝั่ง JS เป็น `number` integer ไม่ใช้ float คำนวณ |
| **`null` ≠ 0** | ยอดที่ยังไม่กรอกเก็บเป็น `null` เพื่อให้สรุปเดือนแสดง "ยังไม่กรอก" ได้ (business ข้อ 13) |
| **`owner_id` ทุก table** | denormalize ไว้ทุกแถวเพื่อให้ RLS เป็น `owner_id = auth.uid()` ตรง ๆ ไม่ต้อง join |
| **เวลา** | `timestamptz` ทั้งหมด วันที่ครบกำหนดเป็น `date` คิดตามเขต `Asia/Bangkok` |
| **ID** | `uuid` (`gen_random_uuid()`) |
| **Snapshot ข้าม user** | ผู้รับยอดไม่เคยอ่าน table ของผู้ส่ง อ่านแค่ snapshot ใน `request_lines` (business ข้อ 11.1 ความเป็นส่วนตัว) |

## 3. Schema

### 3.1 แผนภาพ

```
profiles ─┬─< contacts >─── (linked_user_id → profiles)
          ├─< debt_accounts
          └─< months ─┬─< items ─┬─< sub_items
                      │          └─< split_rules ─< shares >── contacts
                      ├─< offsets >── contacts
                      └─< payment_requests ─┬─< request_lines
                                            └─< request_events
profiles ─< notifications
```

### 3.2 Enums

```sql
create type month_status   as enum ('draft', 'active', 'closed');
create type item_kind      as enum ('card', 'loan', 'expense', 'income');
create type expense_cat    as enum ('spending', 'subscription', 'savings', 'pay_person');
create type pay_plan       as enum ('full', 'minimum', 'custom');
create type item_status    as enum ('pending', 'done');   -- จ่ายแล้ว / ได้รับแล้ว
create type split_mode     as enum ('equal', 'ratio', 'fixed');
create type request_status as enum ('draft', 'sent', 'questioned', 'accepted', 'paid', 'received', 'cancelled');
```

### 3.3 ผู้ใช้และผู้ติดต่อ

```sql
create table profiles (
  id                uuid primary key references auth.users on delete cascade,
  display_name      text not null,
  color             text not null default '#B8A9F0',   -- สี pastel ประจำตัว
  friend_code       text not null unique,               -- โค้ดสั้น ๆ ไว้ให้คนอื่นผูกผู้ติดต่อ
  due_remind_days   smallint not null default 3,        -- เตือนก่อนครบกำหนดกี่วัน
  notify_prefs      jsonb not null default '{}',        -- { "request_received": true, ... }
  created_at        timestamptz not null default now()
);

create table contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles on delete cascade,
  name            text not null,                         -- ชื่อที่เราเรียก เช่น "P'Ball"
  color           text not null,
  linked_user_id  uuid references profiles on delete set null,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (owner_id, linked_user_id)
);
```

- `profiles` สร้างอัตโนมัติด้วย trigger ตอนมีแถวใหม่ใน `auth.users` และสุ่ม `friend_code` ให้ 8 ตัว
- การผูกผู้ติดต่อกับ user ทำผ่าน RPC `link_contact(contact_id, friend_code)` เพื่อไม่ให้ค้นหา user จากอีเมลได้

### 3.4 บัตรและสินเชื่อ (ข้อมูลถาวร)

```sql
create table debt_accounts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles on delete cascade,
  kind                item_kind not null check (kind in ('card', 'loan')),
  name                text not null,                    -- "KTC", "KBank loan"
  provider            text,
  color               text,
  statement_day       smallint check (statement_day between 1 and 31),  -- บัตร
  due_day             smallint check (due_day between 1 and 31),
  installment_amount  bigint check (installment_amount > 0),            -- สินเชื่อ
  total_installments  int check (total_installments > 0),               -- สินเชื่อ (null = ไม่ทราบ)
  archived_at         timestamptz,
  created_at          timestamptz not null default now()
);
```

### 3.5 เดือนและรายการ

```sql
create table months (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles on delete cascade,
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  status      month_status not null default 'draft',
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (owner_id, year, month)
);

create table items (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references profiles on delete cascade,
  month_id           uuid not null references months on delete cascade,
  kind               item_kind not null,
  debt_account_id    uuid references debt_accounts,
  name               text not null,
  category           expense_cat,                    -- ใช้กับ kind = 'expense'
  recurring          boolean not null default false, -- ใช้ตอนคัดลอกเดือน
  amount             bigint check (amount >= 0),     -- บัตร: ยอดเต็ม / อื่น ๆ: ยอดของรายการ (null = ยังไม่กรอก)
  minimum_amount     bigint check (minimum_amount >= 0),  -- บัตรเท่านั้น
  pay_plan           pay_plan,                            -- บัตรเท่านั้น
  custom_amount      bigint check (custom_amount >= 0),   -- บัตร + pay_plan = 'custom'
  installment_no     int,                                 -- สินเชื่อ: งวดที่เท่าไหร่
  planned_amount     bigint generated always as (
                       case
                         when kind = 'card' and pay_plan = 'minimum' then minimum_amount
                         when kind = 'card' and pay_plan = 'custom'  then custom_amount
                         else amount
                       end) stored,                         -- ยอดที่ใช้คำนวณ "คงเหลือ (แผน)"
  due_date           date,
  status             item_status not null default 'pending',
  done_at            timestamptz,
  paid_amount        bigint check (paid_amount >= 0),     -- ยอดจริงที่จ่าย/รับ (null = ใช้ planned_amount)
  source_request_id  uuid,                                -- ถ้ามาจากการยืนยันยอดเรียกเก็บ (FK เพิ่มทีหลัง)
  note               text,
  position           int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check ((kind in ('card', 'loan')) = (debt_account_id is not null)),
  check ((kind = 'expense') = (category is not null)),
  check (kind = 'card' or (minimum_amount is null and pay_plan is null and custom_amount is null)),
  check (kind = 'loan' or installment_no is null)
);

create table sub_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  item_id      uuid not null references items on delete cascade,
  name         text not null,
  amount       bigint not null check (amount >= 0),
  occurred_on  date,
  note         text,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
```

- **ยอดที่ยังไม่แจกแจง** = `items.amount − Σ sub_items.amount` คำนวณใน view `item_totals` ไม่เก็บซ้ำ ถ้าติดลบให้ UI เตือน (business ข้อ 7)
- **ล็อกเดือนที่ปิดแล้ว**: trigger `guard_closed_month` บน `items`, `sub_items`, `split_rules`, `shares`, `offsets` ถ้า `months.status = 'closed'` จะ raise error ยกเว้น `status`/`done_at`/`paid_amount` ของ `items` ที่ยังแก้ได้ (เพื่อกด "จ่ายแล้ว" ย้อนหลัง ตาม business ข้อ 10)

### 3.6 การแบ่งยอด

```sql
create table split_rules (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  month_id     uuid not null references months on delete cascade,
  item_id      uuid not null references items on delete cascade,
  sub_item_id  uuid references sub_items on delete cascade,  -- null = ระดับรายการ
  mode         split_mode not null,
  include_me   boolean not null default true,                 -- equal/ratio: นับเราเป็น 1 ส่วนด้วยไหม
  my_weight    numeric check (my_weight > 0),                 -- ratio + include_me
  recurring    boolean not null default false,                -- คัดลอกไปเดือนหน้า
  unique nulls not distinct (item_id, sub_item_id)
);

create table shares (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles on delete cascade,
  month_id      uuid not null references months on delete cascade,
  rule_id       uuid not null references split_rules on delete cascade,
  contact_id    uuid not null references contacts,
  weight        numeric check (weight > 0),           -- ratio
  fixed_amount  bigint check (fixed_amount >= 0),     -- fixed
  amount        bigint not null check (amount >= 0),  -- ผลลัพธ์ที่คำนวณแล้ว (สตางค์)
  unique (rule_id, contact_id)
);
```

**ยอดตั้งต้น (target) ของกฎ**
- กฎระดับรายการย่อย ใช้ `sub_items.amount`
- กฎระดับรายการ ใช้ **ยอดที่ยังไม่แจกแจง** (`items.amount − Σ sub_items.amount`) เพื่อไม่ให้นับซ้ำกับกฎของรายการย่อย ถ้ารายการไม่มีรายการย่อย target ก็คือ `items.amount`
- คิดจาก `amount` (ยอดเต็ม) ไม่คิดจาก `planned_amount` (business ข้อ 15 #1)

**วิธีคำนวณ** (ทำใน function `recompute_split(rule_id)` เท่านั้น)

| mode | ส่วนของแต่ละคน | ส่วนของเรา |
|---|---|---|
| `equal` | `floor(target / N)` โดย N = จำนวนคน + (1 ถ้า `include_me`) | เศษที่เหลือ |
| `ratio` | `floor(target × weight / Σweight)` (Σweight รวม `my_weight` ถ้า `include_me`) | เศษที่เหลือ |
| `fixed` | `fixed_amount` | `target − Σfixed_amount` (ต้อง ≥ 0 ไม่อย่างนั้น raise error) |

- "ส่วนของเรา" **ไม่เก็บเป็นแถว** แต่คำนวณเป็น target − Σshares ทำให้ผลรวมเท่ากับ target เสมอ และเศษตกเป็นของเราตามกฎ business ข้อ 8
- "ของคนนี้ทั้งหมด" = `equal` กับ 1 คน และ `include_me = false`
- **คำนวณใหม่อัตโนมัติ**: trigger บน `items.amount` และ `sub_items` (insert/update/delete) เรียก `recompute_split` ของกฎที่เกี่ยวข้อง ถ้า `fixed` เกิน target หลังแก้ยอด ให้ทำเป็น error ที่ UI จับไปเตือนได้
- **แบ่งหลายรายการพร้อมกัน**: RPC `apply_split(targets jsonb, mode, parts jsonb, include_me, my_weight, recurring)` วนสร้างกฎทีละ target ใน transaction เดียว
  - หมายเหตุ: หารสองทีละรายการ ผลรวมอาจน้อยกว่าการหารยอดรวมใน Sheet ได้ไม่เกิน 1 สตางค์ต่อรายการ (เศษตกเป็นของเรา)

### 3.7 หักกลบ

```sql
create table offsets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles on delete cascade,
  month_id    uuid not null references months on delete cascade,
  contact_id  uuid not null references contacts,
  name        text not null,                         -- "Dad Insurance"
  amount      bigint not null check (amount > 0),    -- ยอดที่เราติดเขา
  note        text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
```

### 3.8 ยอดเรียกเก็บ

```sql
create table payment_requests (
  id                 uuid primary key default gen_random_uuid(),
  sender_id          uuid not null references profiles,
  recipient_id       uuid not null references profiles,
  sender_month_id    uuid not null references months on delete cascade,
  sender_contact_id  uuid not null references contacts,
  year               smallint not null,
  month              smallint not null,
  status             request_status not null default 'draft',
  version            int not null default 0,          -- +1 ทุกครั้งที่ส่ง
  total              bigint not null default 0,       -- ยอดสุทธิของ version ล่าสุด
  recipient_item_id  uuid references items on delete set null,
  sent_at            timestamptz,
  accepted_at        timestamptz,
  paid_at            timestamptz,
  received_at        timestamptz,
  created_at         timestamptz not null default now()
);
-- ยอดที่ยังไม่ถูกยกเลิกได้แค่ 1 ใบต่อคนต่อเดือน
create unique index one_open_request on payment_requests (sender_month_id, sender_contact_id)
  where status <> 'cancelled';

create table request_lines (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references payment_requests on delete cascade,
  version     int not null,
  kind        text not null check (kind in ('share', 'offset')),
  group_label text,                -- ชื่อรายการแม่ เช่น "KTC"
  label       text not null,       -- ชื่อรายการย่อย หรือชื่อรายการ
  amount      bigint not null,     -- share = บวก, offset = ลบ
  position    int not null
);

create table request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references payment_requests on delete cascade,
  actor_id    uuid not null references profiles,
  type        text not null,       -- sent | resent | questioned | comment | accepted | paid | received | cancelled
  line_id     uuid references request_lines on delete set null,   -- คอมเมนต์รายบรรทัด
  message     text,
  created_at  timestamptz not null default now()
);
```

`request_lines` เป็น **snapshot** ของแต่ละ version ไม่ผูกกลับไปที่ `shares` หรือ `offsets` ของผู้ส่ง เพื่อให้ผู้รับเห็นเฉพาะสิ่งที่ถูกส่งมา และยังเปรียบเทียบความต่างระหว่าง version ได้ (business ข้อ 11.2)

### 3.9 แจ้งเตือน

```sql
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  type        text not null,      -- request_received | request_updated | request_questioned | request_comment
                                  -- | request_accepted | request_paid | request_received_confirmed
                                  -- | request_cancelled | due_soon
  actor_id    uuid references profiles on delete set null,   -- ใครทำให้เกิดแจ้งเตือนนี้
  request_id  uuid references payment_requests on delete cascade,
  item_id     uuid references items on delete cascade,
  data        jsonb not null default '{}',   -- เช่น { "total": 414900, "version": 2 }
  read_at     timestamptz,
  created_at  timestamptz not null default clock_timestamp()
);
```

- **ไม่เก็บข้อความ** ในตาราง UI สร้างข้อความจาก `type` + `data` + ชื่อของ `actor_id` เอง (เปลี่ยนคำหรือภาษาได้โดยไม่ต้องแก้ข้อมูลเก่า)
- แถวแจ้งเตือนถูกสร้างผ่าน function `notify()` เท่านั้น ซึ่งเช็ก `notify_prefs` ก่อนทุกครั้ง (`{"request_received": false}` = ปิดประเภทนั้น) client แก้ได้แค่ `read_at`
- Client subscribe ผ่าน Realtime: `postgres_changes` ที่ `notifications` filter `user_id=eq.<uid>` (RLS กันไม่ให้เห็นของคนอื่นอยู่แล้ว)
- **เตือนวันครบกำหนด**: pg_cron รันทุกวัน 08:00 (Asia/Bangkok) โดยเลือก `items` ที่ `status = 'pending'` และ `due_date` อยู่ในช่วง `due_remind_days` แล้ว insert แบบ `on conflict do nothing`

## 4. Views

```sql
-- ยอดรวมต่อรายการ
create view item_totals with (security_invoker = true) as
select i.id as item_id,
       coalesce(sum(s.amount), 0)                         as sub_total,
       i.amount - coalesce(sum(s.amount), 0)              as unallocated
from items i left join sub_items s on s.item_id = i.id
group by i.id;

-- ยอดสุทธิต่อคนต่อเดือน (business ข้อ 9–10)
create view month_person_balances with (security_invoker = true) as
select m.id as month_id, c.id as contact_id,
       coalesce(sh.total, 0)                              as receivable,
       coalesce(o.total, 0)                               as offset_total,
       coalesce(sh.total, 0) - coalesce(o.total, 0)       as net
from months m
cross join contacts c
left join (select month_id, contact_id, sum(amount) total from shares  group by 1, 2) sh
       on sh.month_id = m.id and sh.contact_id = c.id
left join (select month_id, contact_id, sum(amount) total from offsets group by 1, 2) o
       on o.month_id = m.id and o.contact_id = c.id
where c.owner_id = m.owner_id
  and (sh.total is not null or o.total is not null);
```

`month_summaries` (business ข้อ 12–13) คำนวณต่อเดือน:

| คอลัมน์ | สูตร |
|---|---|
| `income_own` | Σ `planned_amount` ของ `kind = 'income'` |
| `from_people` | Σ `net` ที่ > 0 |
| `to_people` | Σ `|net|` ที่ < 0 |
| `expense_plan` | Σ `planned_amount` ของบัตร, สินเชื่อ, รายจ่าย |
| `expense_if_full` / `expense_if_minimum` | เหมือน `expense_plan` แต่บังคับให้บัตรใช้ `amount` หรือ `minimum_amount` |
| `balance_plan` / `balance_if_full` / `balance_if_minimum` | `income_own + from_people − expense_* − to_people` |
| `balance_actual` | รายรับที่ `done` + ยอดเรียกเก็บที่ `received` − รายจ่ายที่ `done` (ใช้ `coalesce(paid_amount, planned_amount)`) |
| `missing_plan` / `missing_if_full` / `missing_if_minimum` | จำนวนรายการที่ยอดของแต่ละแบบยังเป็น `null` ถ้า > 0 UI ต้องแสดง "⚠️ ยังไม่รวม…" |
| `savings_total` | Σ รายจ่าย `category = 'savings'` |
| `done_count` / `total_count` | ความคืบหน้า (นับ items + ยอดเรียกเก็บของเดือน) |

ทุก view ใช้ `security_invoker = true` เพื่อให้ RLS ของ table ต้นทางมีผลเหมือนเดิม

## 5. RLS

| Table | select | insert / update / delete |
|---|---|---|
| `profiles` | ตัวเอง และคนที่ผูกเป็นผู้ติดต่อกัน (ทางใดทางหนึ่ง) หรือมียอดเรียกเก็บระหว่างกัน | update ได้เฉพาะตัวเอง (ยกเว้น `friend_code`) |
| `contacts`, `debt_accounts`, `months`, `items`, `sub_items`, `offsets` | `owner_id = auth.uid()` | `owner_id = auth.uid()` ยกเว้น 3 อย่างที่เปลี่ยนได้ผ่าน RPC เท่านั้น: `contacts.linked_user_id`, `months.status` และ `items.source_request_id` ส่วนเดือนที่ปิดแล้วลบไม่ได้ |
| `split_rules`, `shares` | `owner_id = auth.uid()` | **RPC เท่านั้น** เพราะต้องคำนวณยอด |
| `payment_requests`, `request_lines` | `auth.uid() in (sender_id, recipient_id)` แต่ผู้รับมองไม่เห็นใบที่สถานะ `draft` | **RPC เท่านั้น** |
| `request_events` | เหมือน `payment_requests` | RPC เท่านั้น |
| `notifications` | `user_id = auth.uid()` | update ได้แค่ `read_at` ของตัวเอง ส่วน insert ทำโดย RPC หรือ cron |

- `profiles` ที่คนอื่นมองเห็นได้คือแค่ `display_name` กับ `color` ผ่าน view `public_profiles` ไม่เห็น `notify_prefs` หรือ `friend_code`
- RPC ทุกตัวที่เป็น `security definer` ต้อง `set search_path = ''` และตรวจ `auth.uid()` เองทุกครั้ง

## 6. RPC

| RPC | ผู้เรียก | หน้าที่ |
|---|---|---|
| `create_month(year, month, copy_from uuid, copy_item_ids uuid[])` | เจ้าของ | สร้างเดือน และคัดลอกรายการตาม 6.1 |
| `set_month_status(month_id, status)` | เจ้าของ | เปิด, ปิด หรือเปิดใหม่ |
| `month_open_requests(month_id)` | เจ้าของ | ยอดเรียกเก็บของเดือนที่ยังไม่ `received` UI เรียกก่อนปิดเดือนเพื่อเตือน |
| `month_copy_candidates(month_id)` | เจ้าของ | รายการที่คัดลอกได้ พร้อมค่า `suggested` สำหรับติ๊กไว้ก่อน |
| `set_split(item_id, sub_item_id, mode, parts jsonb, include_me, my_weight, recurring)` | เจ้าของ | สร้างหรือแทนที่กฎ แล้วคำนวณ `shares` |
| `apply_split(targets jsonb, …)` | เจ้าของ | แบ่งหลายรายการพร้อมกัน |
| `clear_split(item_id, sub_item_id)` | เจ้าของ | ลบกฎ |
| `link_contact(contact_id, friend_code)` | เจ้าของ | ผูกผู้ติดต่อกับ user |
| `send_request(month_id, contact_id, note)` | ผู้ส่ง | ดู 6.2 |
| `cancel_request(request_id)` | ผู้ส่ง | ยกเลิกได้ก่อนสถานะ `paid` และลบรายจ่ายที่สร้างไว้ฝั่งผู้รับ |
| `comment_request(request_id, line_id, message, is_question bool)` | ทั้งสองฝ่าย | ถ้าเป็นคำถามจากผู้รับ สถานะเปลี่ยนเป็น `questioned` |
| `accept_request(request_id)` | ผู้รับ | ดู 6.2 |
| `mark_request_paid(request_id, paid_amount)` | ผู้รับ | ต้อง `accepted` ก่อน จากนั้นสถานะเปลี่ยนเป็น `paid` และรายการฝั่งผู้รับเปลี่ยนเป็น `done` |
| `confirm_request_received(request_id)` | ผู้ส่ง | สถานะเปลี่ยนเป็น `received` |

### 6.1 คัดลอกเดือน (business ข้อ 5.2)

ระบบเลือกรายการที่จะเสนอให้คัดลอกก่อน แล้วผู้ใช้ติ๊กเพิ่มหรือเอาออกได้ เสร็จแล้วส่งรายการที่เลือกมาทาง `copy_item_ids`

| kind | ค่าที่คัดลอก | เงื่อนไขการเสนอ |
|---|---|---|
| `loan` | `amount = installment_amount`, `installment_no + 1`, `due_date` เลื่อน 1 เดือน | ไม่เสนอถ้า `installment_no = total_installments` (ผ่อนครบแล้ว) |
| `card` | ชื่อ, บัญชี, `pay_plan`, `due_date` เลื่อน 1 เดือน, `amount`/`minimum_amount`/`custom_amount` เป็น `null` | เสนอทุกใบที่ยังไม่ archive |
| `expense` / `income` | ชื่อ, หมวด, `amount` | เสนอเฉพาะ `recurring = true` |
| `split_rules` | กฎและ shares ของรายการที่ถูกคัดลอก | เฉพาะ `recurring = true` และเป็นกฎระดับรายการ |
| อื่น ๆ | `status = 'pending'`, ไม่คัดลอกรายการย่อย, หักกลบ และยอดเรียกเก็บ | |

`items.source_request_id` (รายการที่มาจากการยืนยันยอด) **ไม่ถูกคัดลอก**

### 6.2 วงจรยอดเรียกเก็บ (business ข้อ 11)

```
            send_request                accept_request          mark_request_paid
  (none) ─────────────▶ sent ─────────────────────▶ accepted ───────────────────▶ paid
                         │  ▲                         │                             │
     comment(question)   ▼  │ send_request (resend)   │ send_request (resend)       │ confirm_request_received
                     questioned ◀─────────────────────┘                             ▼
                                                                                received
  cancel_request: จาก sent / questioned / accepted → cancelled
```

**`send_request`**
1. ตรวจว่าผู้ติดต่อผูกกับ user แล้ว และ `net > 0`
   - ถ้า `net ≤ 0` ส่งไม่ได้ เพราะเราเป็นฝ่ายที่ต้องจ่าย ให้อีกฝ่ายเป็นคนส่งยอดมา
2. ถ้ายังไม่มียอดเรียกเก็บของคนนี้ในเดือนนี้ ให้สร้างใหม่ ถ้ามีอยู่แล้วและสถานะยังไม่ถึง `paid` ให้ใช้ใบเดิม (= ส่งใหม่)
3. `version + 1` แล้ว snapshot ส่วนแบ่ง (`kind = 'share'`) และการหักกลบ (`kind = 'offset'`) ของคนนี้ลงใน `request_lines` จากนั้นตั้ง `total`
4. สถานะเปลี่ยนเป็น `sent` บันทึก event `sent` หรือ `resent` แล้ว notify ผู้รับ (`request_received` หรือ `request_updated`)

**`accept_request`**
1. หาเดือน `(year, month)` ของผู้รับ ถ้ายังไม่มีให้สร้างเป็น `draft`
2. หาผู้ติดต่อฝั่งผู้รับที่ `linked_user_id = sender_id` ถ้ายังไม่มีให้สร้างใหม่จากชื่อของผู้ส่ง
3. ถ้ายังไม่มี `recipient_item_id` ให้สร้าง `items` ใหม่ (`kind = 'expense'`, `category = 'pay_person'`, `name = <ชื่อผู้ส่ง>`, `amount = total`, `source_request_id`) ถ้ามีแล้ว (เป็นการยืนยันรอบใหม่หลังผู้ส่งแก้ยอด) ให้อัปเดต `amount`
4. สถานะเปลี่ยนเป็น `accepted` แล้ว notify ผู้ส่ง

**ยอดเปลี่ยนหลังส่ง**: UI เทียบ `net` ปัจจุบันกับ `total` ถ้าไม่เท่ากันให้แสดง badge "ยอดเปลี่ยน — ส่งใหม่" ระบบไม่ส่งใหม่ให้อัตโนมัติ

## 7. Frontend data access

```
src/
  lib/
    supabase.ts        client
    database.types.ts  generated: supabase gen types typescript --local
    money.ts           toSatang / fromSatang / formatBaht
  features/
    months/   items/   splits/   people/   requests/   notifications/
      api.ts           wrapper ของ query และ RPC ใน feature นั้น
      components/
```

- ใช้ `supabase.from(...)` กับ table ของตัวเอง และ `supabase.rpc(...)` กับทุกอย่างในข้อ 6
- ยังไม่ใส่ lib จัดการ cache (เช่น TanStack Query) ใน MVP ใช้ hook ของแต่ละ feature (`useMonth(id)` เป็นต้น) ที่ refetch หลัง mutation ถ้าเริ่มซับซ้อนค่อยพิจารณาใหม่
- Realtime ใช้แค่ `notifications` และ `payment_requests` (อัปเดตสถานะสด ๆ)

## 8. ลำดับการทำ

1. ✅ **Migration 1** (`20261021063616_core_schema.sql`): profiles, contacts, debt_accounts, months, items, sub_items + RLS + trigger ล็อกเดือน + `link_contact` + views `public_profiles`, `item_totals`
2. ✅ **Migration 2** (`20261029150406_splits_offsets.sql`): split_rules, shares, offsets + `recompute_split` + `set_split` / `apply_split` + views
3. ✅ **Migration 3** (`20261029150707_months_summary.sql`): `month_copy_candidates`, `create_month` (คัดลอก), `set_month_status`, `month_summaries`
4. ✅ **Migration 4** (`20261029152223_payment_requests.sql`): payment_requests, request_lines, request_events, notifications + RPC ข้อ 6.2 + `month_open_requests` + Realtime + `balance_actual` นับยอดที่ได้รับจากคน
   - ข้อจำกัด: 1 คนต่อ 1 เดือนมีได้แค่ 1 ใบที่ยังไม่ถูกยกเลิก ถ้าได้รับเงินแล้วมียอดเพิ่มทีหลัง ต้องลงในเดือนถัดไป
5. **Migration 5**: pg_cron เตือนวันครบกำหนด
6. **Seed**: ข้อมูลเดือนตุลาคมจากชีต1 ใช้ทดสอบว่าได้ 35,368.52 / −4,686.48 (business ข้อ 13.1)

แต่ละ migration มีเทสต์ SQL (pgTAP ผ่าน `supabase test db`) ครอบคลุมการปัดเศษของการแบ่ง, RLS ข้าม user และ state machine ของยอดเรียกเก็บ
