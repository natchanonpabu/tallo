-- Splits, offsets and per-person balances. See docs/design.md §3.6, §3.7, §4 and business.md §8–§10.
-- Split rows are written only by the functions below; "my share" is never stored, it is the
-- target minus everyone else's share, so rounding remainders always land on the owner.

create type public.split_mode as enum ('equal', 'ratio', 'fixed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.split_rules (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles on delete cascade,
  month_id     uuid not null references public.months on delete cascade,
  item_id      uuid not null references public.items on delete cascade,
  sub_item_id  uuid references public.sub_items on delete cascade,
  mode         public.split_mode not null,
  include_me   boolean not null default true,
  my_weight    numeric check (my_weight > 0),
  recurring    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique nulls not distinct (item_id, sub_item_id),
  check (mode = 'ratio' or my_weight is null),
  check (mode <> 'ratio' or include_me = (my_weight is not null))
);
create index split_rules_month_idx on public.split_rules (month_id);

create table public.shares (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles on delete cascade,
  month_id      uuid not null references public.months on delete cascade,
  rule_id       uuid not null references public.split_rules on delete cascade,
  contact_id    uuid not null references public.contacts,
  weight        numeric check (weight > 0),
  fixed_amount  bigint check (fixed_amount >= 0),
  amount        bigint not null default 0 check (amount >= 0),
  unique (rule_id, contact_id)
);
create index shares_month_contact_idx on public.shares (month_id, contact_id);
create index shares_contact_idx on public.shares (contact_id);

create table public.offsets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  month_id    uuid not null references public.months on delete cascade,
  contact_id  uuid not null references public.contacts,
  name        text not null check (length(trim(name)) > 0),
  amount      bigint not null check (amount > 0),
  note        text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index offsets_month_contact_idx on public.offsets (month_id, contact_id);
create index offsets_contact_idx on public.offsets (contact_id);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.split_rules enable row level security;
alter table public.shares enable row level security;
alter table public.offsets enable row level security;

create policy "split_rules: read own" on public.split_rules
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "shares: read own" on public.shares
  for select to authenticated using (owner_id = (select auth.uid()));

-- Splits are written through set_split / apply_split / clear_split only.
revoke all on public.split_rules, public.shares from anon, authenticated;
grant select on public.split_rules, public.shares to authenticated;

create policy "offsets: read own" on public.offsets
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "offsets: delete own" on public.offsets
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "offsets: create own" on public.offsets
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.months m
                where m.id = month_id and m.owner_id = (select auth.uid()))
    and exists (select 1 from public.contacts c
                where c.id = contact_id and c.owner_id = (select auth.uid()))
  );
create policy "offsets: update own" on public.offsets
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.contacts c
                where c.id = contact_id and c.owner_id = (select auth.uid()))
  );

revoke all on public.offsets from anon, authenticated;
grant select, delete on public.offsets to authenticated;
grant insert (month_id, contact_id, name, amount, note, position) on public.offsets to authenticated;
grant update (contact_id, name, amount, note, position) on public.offsets to authenticated;

-- ---------------------------------------------------------------------------
-- Closed-month lock
-- ---------------------------------------------------------------------------

create function public.guard_month_rows_closed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op <> 'DELETE' and public.month_is_closed(new.month_id))
     or (tg_op <> 'INSERT' and public.month_is_closed(old.month_id)) then
    raise exception 'month_closed';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger split_rules_guard_closed_month
  before insert or update or delete on public.split_rules
  for each row execute function public.guard_month_rows_closed();
create trigger shares_guard_closed_month
  before insert or update or delete on public.shares
  for each row execute function public.guard_month_rows_closed();
create trigger offsets_guard_closed_month
  before insert or update or delete on public.offsets
  for each row execute function public.guard_month_rows_closed();

-- ---------------------------------------------------------------------------
-- Split calculation
-- ---------------------------------------------------------------------------

-- Amount a rule divides: the sub-item amount, or for an item-level rule the part of the
-- item not broken down into sub-items. Not-filled-in (null) and negative count as 0.
create function public.split_target(p_rule public.split_rules)
returns bigint
language sql
stable
set search_path = ''
as $$
  select greatest(0, coalesce(
    case
      when p_rule.sub_item_id is not null then
        (select s.amount from public.sub_items s where s.id = p_rule.sub_item_id)
      else
        (select i.amount - coalesce((select sum(s.amount) from public.sub_items s
                                     where s.item_id = i.id), 0)
           from public.items i where i.id = p_rule.item_id)
    end, 0))::bigint;
$$;

create function public.recompute_split(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.split_rules;
  v_target bigint;
  v_parts int;
  v_total_weight numeric;
  v_fixed_total bigint;
begin
  select * into v_rule from public.split_rules where id = p_rule_id;
  if v_rule.id is null then
    return;  -- rule removed by a cascade in the same statement
  end if;

  v_target := public.split_target(v_rule);

  case v_rule.mode
    when 'equal' then
      select count(*) + (case when v_rule.include_me then 1 else 0 end)
        into v_parts from public.shares where rule_id = p_rule_id;
      update public.shares set amount = v_target / v_parts where rule_id = p_rule_id;

    when 'ratio' then
      select sum(weight) + coalesce(v_rule.my_weight, 0)
        into v_total_weight from public.shares where rule_id = p_rule_id;
      update public.shares
         set amount = floor(v_target * weight / v_total_weight)::bigint
       where rule_id = p_rule_id;

    when 'fixed' then
      select coalesce(sum(fixed_amount), 0)
        into v_fixed_total from public.shares where rule_id = p_rule_id;
      if v_fixed_total > v_target then
        raise exception 'split_exceeds_amount'
          using detail = format('shares %s > amount %s', v_fixed_total, v_target);
      end if;
      update public.shares set amount = fixed_amount where rule_id = p_rule_id;
  end case;
end;
$$;

revoke execute on function public.recompute_split(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: set_split / apply_split / clear_split
-- ---------------------------------------------------------------------------

-- p_parts: [{"contact_id": uuid, "weight": number}] for ratio,
--          [{"contact_id": uuid, "amount": satang}] for fixed,
--          [{"contact_id": uuid}] for equal.
create function public.set_split(
  p_item_id      uuid,
  p_sub_item_id  uuid,
  p_mode         public.split_mode,
  p_parts        jsonb,
  p_include_me   boolean default true,
  p_my_weight    numeric default null,
  p_recurring    boolean default false
)
returns public.split_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.items;
  v_rule public.split_rules;
  v_part jsonb;
  v_contact_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_item from public.items where id = p_item_id and owner_id = v_uid;
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if v_item.kind = 'income' then
    raise exception 'cannot_split_income' using errcode = '22023';
  end if;
  if p_sub_item_id is not null
     and not exists (select 1 from public.sub_items where id = p_sub_item_id and item_id = p_item_id) then
    raise exception 'sub_item_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_parts) is distinct from 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'split_needs_people' using errcode = '22023';
  end if;
  if p_mode = 'ratio' and p_include_me and p_my_weight is null then
    raise exception 'split_needs_my_weight' using errcode = '22023';
  end if;

  insert into public.split_rules (owner_id, month_id, item_id, sub_item_id, mode, include_me, my_weight, recurring)
  values (v_uid, v_item.month_id, p_item_id, p_sub_item_id, p_mode,
          p_mode = 'fixed' or p_include_me,
          case when p_mode = 'ratio' and p_include_me then p_my_weight end,
          p_recurring)
  on conflict (item_id, sub_item_id) do update
     set mode = excluded.mode,
         include_me = excluded.include_me,
         my_weight = excluded.my_weight,
         recurring = excluded.recurring
  returning * into v_rule;

  delete from public.shares where rule_id = v_rule.id;

  for v_part in select * from jsonb_array_elements(p_parts) loop
    v_contact_id := (v_part ->> 'contact_id')::uuid;
    if not exists (select 1 from public.contacts
                   where id = v_contact_id and owner_id = v_uid and archived_at is null) then
      raise exception 'contact_not_found' using errcode = 'P0002';
    end if;
    if p_mode = 'ratio' and coalesce((v_part ->> 'weight')::numeric, 0) <= 0 then
      raise exception 'split_needs_weight' using errcode = '22023';
    end if;
    if p_mode = 'fixed' and coalesce((v_part ->> 'amount')::bigint, -1) < 0 then
      raise exception 'split_needs_amount' using errcode = '22023';
    end if;

    insert into public.shares (owner_id, month_id, rule_id, contact_id, weight, fixed_amount)
    values (v_uid, v_item.month_id, v_rule.id, v_contact_id,
            case when p_mode = 'ratio' then (v_part ->> 'weight')::numeric end,
            case when p_mode = 'fixed' then (v_part ->> 'amount')::bigint end);
  end loop;

  perform public.recompute_split(v_rule.id);
  return v_rule;
end;
$$;

-- p_targets: [{"item_id": uuid, "sub_item_id": uuid | null}, ...] — one rule per target,
-- all in one transaction (business.md §8 "แบ่งหลายรายการพร้อมกัน").
create function public.apply_split(
  p_targets      jsonb,
  p_mode         public.split_mode,
  p_parts        jsonb,
  p_include_me   boolean default true,
  p_my_weight    numeric default null,
  p_recurring    boolean default false
)
returns setof public.split_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target jsonb;
begin
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'split_needs_targets' using errcode = '22023';
  end if;
  for v_target in select * from jsonb_array_elements(p_targets) loop
    return next public.set_split(
      (v_target ->> 'item_id')::uuid,
      (v_target ->> 'sub_item_id')::uuid,
      p_mode, p_parts, p_include_me, p_my_weight, p_recurring);
  end loop;
end;
$$;

create function public.clear_split(p_item_id uuid, p_sub_item_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.split_rules
   where owner_id = auth.uid()
     and item_id = p_item_id
     and sub_item_id is not distinct from p_sub_item_id;
end;
$$;

revoke execute on function public.set_split(uuid, uuid, public.split_mode, jsonb, boolean, numeric, boolean) from public, anon;
revoke execute on function public.apply_split(jsonb, public.split_mode, jsonb, boolean, numeric, boolean) from public, anon;
revoke execute on function public.clear_split(uuid, uuid) from public, anon;
grant execute on function public.set_split(uuid, uuid, public.split_mode, jsonb, boolean, numeric, boolean) to authenticated;
grant execute on function public.apply_split(jsonb, public.split_mode, jsonb, boolean, numeric, boolean) to authenticated;
grant execute on function public.clear_split(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep shares in sync when amounts change
-- ---------------------------------------------------------------------------

create function public.resplit_after_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_id uuid;
begin
  for v_rule_id in
    select id from public.split_rules where item_id = new.id and sub_item_id is null
  loop
    perform public.recompute_split(v_rule_id);
  end loop;
  return null;
end;
$$;

create trigger items_resplit
  after update of amount on public.items
  for each row
  when (old.amount is distinct from new.amount)
  execute function public.resplit_after_item_change();

-- A sub-item change affects its own rule and the item-level rule (the unallocated part).
create function public.resplit_after_sub_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid := coalesce(new.item_id, old.item_id);
  v_rule_id uuid;
begin
  for v_rule_id in
    select id from public.split_rules
     where item_id = v_item_id
       and (sub_item_id is null or sub_item_id = new.id)
  loop
    perform public.recompute_split(v_rule_id);
  end loop;
  return null;
end;
$$;

create trigger sub_items_resplit
  after insert or delete or update of amount on public.sub_items
  for each row execute function public.resplit_after_sub_item_change();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Net per person per month (business.md §9–§10): positive = they owe me, negative = I owe them.
create view public.month_person_balances with (security_invoker = true) as
select month_id,
       contact_id,
       sum(receivable)::bigint                  as receivable,
       sum(offset_amount)::bigint               as offset_total,
       (sum(receivable) - sum(offset_amount))::bigint as net
from (
  select month_id, contact_id, amount as receivable, 0::bigint as offset_amount from public.shares
  union all
  select month_id, contact_id, 0::bigint, amount from public.offsets
) t
group by month_id, contact_id;

revoke all on public.month_person_balances from anon;
grant select on public.month_person_balances to authenticated;
