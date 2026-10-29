-- Cards keep a single amount: no full / minimum / custom plans (business.md §6.1, decided 2026-10-29).
-- items.amount is now the only amount used everywhere.

drop view public.month_summaries;

alter table public.items
  drop column planned_amount,
  drop column minimum_amount,
  drop column custom_amount,
  drop column pay_plan;

drop type public.pay_plan;

-- ---------------------------------------------------------------------------
-- Functions that used the removed columns
-- ---------------------------------------------------------------------------

create or replace function public.guard_items_closed_month()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status_only constant text[] := array['status', 'done_at', 'paid_amount', 'updated_at'];
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

create or replace function public.create_month(
  p_year           smallint,
  p_month          smallint,
  p_copy_from      uuid default null,
  p_copy_item_ids  uuid[] default null
)
returns public.months
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_month public.months;
  v_src public.months;
  v_shift int;
  v_last_day int;
  v_item record;
  v_new_item_id uuid;
  v_rule public.split_rules;
  v_new_rule_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_copy_from is not null then
    select * into v_src from public.months where id = p_copy_from and owner_id = v_uid;
    if v_src.id is null then
      raise exception 'month_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.months (owner_id, year, month)
  values (v_uid, p_year, p_month)
  returning * into v_month;

  if v_src.id is null then
    return v_month;
  end if;

  v_shift := (p_year * 12 + p_month) - (v_src.year * 12 + v_src.month);
  v_last_day := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int;

  for v_item in
    select i.*, d.installment_amount, d.due_day
    from public.items i
    left join public.debt_accounts d on d.id = i.debt_account_id
    where i.month_id = v_src.id
      and i.source_request_id is null
      and (case when p_copy_item_ids is null
                then i.id in (select c.item_id from public.month_copy_candidates(v_src.id) c where c.suggested)
                else i.id = any (p_copy_item_ids) end)
    order by i.position, i.created_at
  loop
    insert into public.items (
      owner_id, month_id, kind, debt_account_id, name, category, recurring,
      amount, installment_no, due_date, position)
    values (
      v_uid, v_month.id, v_item.kind, v_item.debt_account_id, v_item.name, v_item.category, v_item.recurring,
      case v_item.kind
        when 'card' then null                                        -- new statement every month
        when 'loan' then coalesce(v_item.installment_amount, v_item.amount)
        else v_item.amount
      end,
      case when v_item.kind = 'loan' then coalesce(v_item.installment_no, 0) + 1 end,
      case
        when v_item.due_day is not null then make_date(p_year, p_month, least(v_item.due_day, v_last_day))
        when v_item.due_date is not null then (v_item.due_date + make_interval(months => v_shift))::date
      end,
      v_item.position)
    returning id into v_new_item_id;

    -- Recurring item-level splits follow the item (sub-items are never copied).
    for v_rule in
      select * from public.split_rules
      where item_id = v_item.id and sub_item_id is null and recurring
    loop
      insert into public.split_rules (owner_id, month_id, item_id, mode, include_me, my_weight, recurring)
      values (v_uid, v_month.id, v_new_item_id, v_rule.mode, v_rule.include_me, v_rule.my_weight, true)
      returning id into v_new_rule_id;

      insert into public.shares (owner_id, month_id, rule_id, contact_id, weight, fixed_amount)
      select v_uid, v_month.id, v_new_rule_id, s.contact_id, s.weight, s.fixed_amount
      from public.shares s
      join public.contacts c on c.id = s.contact_id
      where s.rule_id = v_rule.id and c.archived_at is null;

      if found then
        perform public.recompute_split(v_new_rule_id);
      else
        delete from public.split_rules where id = v_new_rule_id;
      end if;
    end loop;
  end loop;

  return v_month;
end;
$$;

create or replace function public.create_due_notifications(p_today date default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  v_count int;
begin
  insert into public.notifications (user_id, type, item_id, data)
  select i.owner_id, 'due_soon', i.id,
         jsonb_build_object('name', i.name, 'due_date', i.due_date, 'amount', i.amount,
                            'days_left', i.due_date - v_today)
  from public.items i
  join public.profiles p on p.id = i.owner_id
  where i.status = 'pending'
    and i.kind <> 'income'
    and i.due_date between v_today and v_today + p.due_remind_days
    and coalesce((p.notify_prefs ->> 'due_soon')::boolean, true)
  on conflict (user_id, item_id) where type = 'due_soon' do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- month_summaries (business.md §12–§13)
-- ---------------------------------------------------------------------------

create view public.month_summaries with (security_invoker = true) as
with item_sums as (
  select
    month_id,
    coalesce(sum(amount) filter (where kind = 'income'), 0)               as income_own,
    coalesce(sum(amount) filter (where kind <> 'income'), 0)              as expense_total,
    count(*) filter (where amount is null)                                as missing_count,
    coalesce(sum(amount) filter (where category = 'savings'), 0)          as savings_total,
    coalesce(sum(coalesce(paid_amount, amount))
               filter (where kind = 'income' and status = 'done'), 0)     as income_done,
    coalesce(sum(coalesce(paid_amount, amount))
               filter (where kind <> 'income' and status = 'done'), 0)    as expense_done,
    count(*) filter (where status = 'done')                               as done_count,
    count(*)                                                              as total_count
  from public.items
  group by month_id
),
people as (
  select month_id,
         coalesce(sum(net) filter (where net > 0), 0)  as from_people,
         coalesce(-sum(net) filter (where net < 0), 0) as to_people
  from public.month_person_balances
  group by month_id
),
requests as (
  select sender_month_id as month_id,
         coalesce(sum(total) filter (where status = 'received'), 0) as received_total,
         count(*) filter (where status = 'received')                as received_count,
         count(*)                                                   as request_count
  from public.payment_requests
  where status <> 'cancelled'
  group by sender_month_id
)
select
  m.id                                                   as month_id,
  m.year,
  m.month,
  m.status,
  coalesce(i.income_own, 0)::bigint                      as income_own,
  coalesce(p.from_people, 0)::bigint                     as from_people,
  coalesce(p.to_people, 0)::bigint                       as to_people,
  coalesce(i.expense_total, 0)::bigint                   as expense_total,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_total, 0) - coalesce(p.to_people, 0))::bigint      as balance,
  (coalesce(i.income_done, 0) + coalesce(r.received_total, 0)
     - coalesce(i.expense_done, 0))::bigint                                  as balance_actual,
  coalesce(i.missing_count, 0)::int                      as missing_count,
  coalesce(i.savings_total, 0)::bigint                   as savings_total,
  (coalesce(i.done_count, 0) + coalesce(r.received_count, 0))::int  as done_count,
  (coalesce(i.total_count, 0) + coalesce(r.request_count, 0))::int  as total_count
from public.months m
left join item_sums i on i.month_id = m.id
left join people p on p.month_id = m.id
left join requests r on r.month_id = m.id;

revoke all on public.month_summaries from anon;
grant select on public.month_summaries to authenticated;
