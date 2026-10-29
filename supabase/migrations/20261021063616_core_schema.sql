-- Tallo core schema: profiles, contacts, debt accounts, months, items, sub-items.
-- See docs/design.md §2–§5. Money columns are bigint satang; null means "not filled in yet".

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.month_status as enum ('draft', 'active', 'closed');
create type public.item_kind    as enum ('card', 'loan', 'expense', 'income');
create type public.expense_cat  as enum ('spending', 'subscription', 'savings', 'pay_person');
create type public.pay_plan     as enum ('full', 'minimum', 'custom');
create type public.item_status  as enum ('pending', 'done');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  display_name     text not null check (length(trim(display_name)) > 0),
  color            text not null default '#B8A9F0',
  friend_code      text not null unique,
  due_remind_days  smallint not null default 3 check (due_remind_days between 0 and 31),
  notify_prefs     jsonb not null default '{}',
  created_at       timestamptz not null default now()
);

-- 8 characters from a 32-letter alphabet without look-alikes (no I, O, 0, 1).
create function public.generate_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, 1 + get_byte(bytes, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'me'
    ),
    public.generate_friend_code()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, color, due_remind_days, notify_prefs) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  color           text not null default '#A8E6CF',
  linked_user_id  uuid references public.profiles on delete set null,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (owner_id, linked_user_id),
  check (linked_user_id is distinct from owner_id)
);
create index contacts_linked_user_idx on public.contacts (linked_user_id);

alter table public.contacts enable row level security;

create policy "contacts: owner" on public.contacts
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- linked_user_id is only set through link_contact().
revoke all on public.contacts from anon, authenticated;
grant select, delete on public.contacts to authenticated;
grant insert (name, color) on public.contacts to authenticated;
grant update (name, color, archived_at) on public.contacts to authenticated;

create function public.link_contact(p_contact_id uuid, p_friend_code text)
returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_contact public.contacts;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select id into v_target from public.profiles where friend_code = upper(trim(p_friend_code));
  if v_target is null then
    raise exception 'friend_code_not_found' using errcode = 'P0002';
  end if;
  if v_target = v_uid then
    raise exception 'cannot_link_self' using errcode = '22023';
  end if;

  update public.contacts
     set linked_user_id = v_target
   where id = p_contact_id and owner_id = v_uid
  returning * into v_contact;

  if v_contact.id is null then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;
  return v_contact;
end;
$$;

revoke execute on function public.link_contact(uuid, text) from public, anon;
grant execute on function public.link_contact(uuid, text) to authenticated;

-- Names and colors of people connected to me through contacts, in either direction.
-- Runs as the view owner on purpose: profiles RLS only exposes your own row.
create view public.public_profiles as
select p.id, p.display_name, p.color
from public.profiles p
where p.id = (select auth.uid())
   or exists (select 1 from public.contacts c
              where c.owner_id = (select auth.uid()) and c.linked_user_id = p.id)
   or exists (select 1 from public.contacts c
              where c.owner_id = p.id and c.linked_user_id = (select auth.uid()));

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Debt accounts (cards and loans that live across months)
-- ---------------------------------------------------------------------------

create table public.debt_accounts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references public.profiles on delete cascade,
  kind                public.item_kind not null check (kind in ('card', 'loan')),
  name                text not null check (length(trim(name)) > 0),
  provider            text,
  color               text,
  statement_day       smallint check (statement_day between 1 and 31),
  due_day             smallint check (due_day between 1 and 31),
  installment_amount  bigint check (installment_amount > 0),
  total_installments  int check (total_installments > 0),
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  check (kind = 'card' or statement_day is null),
  check (kind = 'loan' or (installment_amount is null and total_installments is null))
);
create index debt_accounts_owner_idx on public.debt_accounts (owner_id);

alter table public.debt_accounts enable row level security;

create policy "debt_accounts: owner" on public.debt_accounts
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.debt_accounts from anon;

-- ---------------------------------------------------------------------------
-- Months
-- ---------------------------------------------------------------------------

create table public.months (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  year        smallint not null check (year between 2000 and 2100),
  month       smallint not null check (month between 1 and 12),
  status      public.month_status not null default 'draft',
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (owner_id, year, month)
);

alter table public.months enable row level security;

create policy "months: read own" on public.months
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "months: create own" on public.months
  for insert to authenticated with check (owner_id = (select auth.uid()));
-- A closed month has to be reopened before it can be deleted.
create policy "months: delete own open" on public.months
  for delete to authenticated using (owner_id = (select auth.uid()) and status <> 'closed');

-- Status changes go through set_month_status() (migration 3).
revoke all on public.months from anon, authenticated;
grant select, delete on public.months to authenticated;
grant insert (year, month) on public.months to authenticated;

create function public.month_is_closed(p_month_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select status = 'closed' from public.months where id = p_month_id), false);
$$;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

create table public.items (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references public.profiles on delete cascade,
  month_id           uuid not null references public.months on delete cascade,
  kind               public.item_kind not null,
  debt_account_id    uuid references public.debt_accounts,
  name               text not null check (length(trim(name)) > 0),
  category           public.expense_cat,
  recurring          boolean not null default false,
  amount             bigint check (amount >= 0),
  minimum_amount     bigint check (minimum_amount >= 0),
  pay_plan           public.pay_plan,
  custom_amount      bigint check (custom_amount >= 0),
  installment_no     int check (installment_no > 0),
  planned_amount     bigint generated always as (
                       case
                         when kind = 'card' and pay_plan = 'minimum' then minimum_amount
                         when kind = 'card' and pay_plan = 'custom'  then custom_amount
                         else amount
                       end
                     ) stored,
  due_date           date,
  status             public.item_status not null default 'pending',
  done_at            timestamptz,
  paid_amount        bigint check (paid_amount >= 0),
  source_request_id  uuid,
  note               text,
  position           int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check ((kind in ('card', 'loan')) = (debt_account_id is not null)),
  check ((kind = 'expense') = (category is not null)),
  check ((kind = 'card') = (pay_plan is not null)),
  check (kind = 'card' or (minimum_amount is null and custom_amount is null)),
  check (kind = 'loan' or installment_no is null)
);
create index items_month_idx on public.items (month_id, position);
create index items_due_idx on public.items (due_date) where status = 'pending';

alter table public.items enable row level security;

create policy "items: read own" on public.items
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "items: delete own" on public.items
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "items: create own" on public.items
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.months m
                where m.id = month_id and m.owner_id = (select auth.uid()))
    and (debt_account_id is null
         or exists (select 1 from public.debt_accounts d
                    where d.id = debt_account_id and d.owner_id = (select auth.uid())
                      and d.kind = items.kind))
  );
create policy "items: update own" on public.items
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (debt_account_id is null
         or exists (select 1 from public.debt_accounts d
                    where d.id = debt_account_id and d.owner_id = (select auth.uid())
                      and d.kind = items.kind))
  );

-- owner_id and source_request_id are system-managed; month_id and kind are fixed after insert.
revoke all on public.items from anon, authenticated;
grant select, delete on public.items to authenticated;
grant insert (month_id, kind, debt_account_id, name, category, recurring, amount, minimum_amount,
              pay_plan, custom_amount, installment_no, due_date, status, done_at, paid_amount,
              note, position)
  on public.items to authenticated;
grant update (debt_account_id, name, category, recurring, amount, minimum_amount, pay_plan,
              custom_amount, installment_no, due_date, status, done_at, paid_amount, note, position)
  on public.items to authenticated;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

-- In a closed month only the "done" fields may change (business.md §10).
-- planned_amount is excluded because generated columns are still null in BEFORE triggers.
create function public.guard_items_closed_month()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status_only constant text[] := array['status', 'done_at', 'paid_amount', 'updated_at', 'planned_amount'];
begin
  if tg_op = 'INSERT' then
    if public.month_is_closed(new.month_id) then
      raise exception 'month_closed';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if public.month_is_closed(old.month_id)
       and (to_jsonb(new) - status_only) is distinct from (to_jsonb(old) - status_only) then
      raise exception 'month_closed';
    end if;
    return new;
  else
    if public.month_is_closed(old.month_id) then
      raise exception 'month_closed';
    end if;
    return old;
  end if;
end;
$$;

create trigger items_guard_closed_month
  before insert or update or delete on public.items
  for each row execute function public.guard_items_closed_month();

-- ---------------------------------------------------------------------------
-- Sub-items
-- ---------------------------------------------------------------------------

create table public.sub_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  item_id      uuid not null references public.items on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  amount       bigint not null check (amount >= 0),
  occurred_on  date,
  note         text,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index sub_items_item_idx on public.sub_items (item_id, position);

alter table public.sub_items enable row level security;

create policy "sub_items: read own" on public.sub_items
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "sub_items: delete own" on public.sub_items
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "sub_items: create own" on public.sub_items
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.items i
                where i.id = item_id and i.owner_id = (select auth.uid()))
  );
create policy "sub_items: update own" on public.sub_items
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.sub_items from anon, authenticated;
grant select, delete on public.sub_items to authenticated;
grant insert (item_id, name, amount, occurred_on, note, position) on public.sub_items to authenticated;
grant update (name, amount, occurred_on, note, position) on public.sub_items to authenticated;

create function public.guard_sub_items_closed_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.month_is_closed(
       (select month_id from public.items where id = coalesce(new.item_id, old.item_id))
     ) then
    raise exception 'month_closed';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger sub_items_guard_closed_month
  before insert or update or delete on public.sub_items
  for each row execute function public.guard_sub_items_closed_month();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- unallocated = item amount not yet broken down into sub-items (business.md §7).
create view public.item_totals with (security_invoker = true) as
select i.id                                 as item_id,
       coalesce(sum(s.amount), 0)::bigint   as sub_total,
       (i.amount - coalesce(sum(s.amount), 0))::bigint as unallocated
from public.items i
left join public.sub_items s on s.item_id = i.id
group by i.id;

revoke all on public.item_totals from anon;
grant select on public.item_totals to authenticated;
