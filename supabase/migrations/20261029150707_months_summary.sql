-- Month lifecycle and summary: copy candidates, create_month (copy from a previous month),
-- set_month_status, month_summaries. See docs/design.md §4, §6.1 and business.md §5, §12, §13.

-- ---------------------------------------------------------------------------
-- Copy candidates (business.md §5.2)
-- ---------------------------------------------------------------------------

-- Every item of a month that may be copied, with whether it is ticked by default.
-- Items created from a payment request are never offered.
create function public.month_copy_candidates(p_month_id uuid)
returns table (item_id uuid, suggested boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id,
         case i.kind
           when 'loan' then d.archived_at is null
                            and (d.total_installments is null
                                 or coalesce(i.installment_no, 0) < d.total_installments)
           when 'card' then d.archived_at is null
           else i.recurring
         end
  from public.items i
  left join public.debt_accounts d on d.id = i.debt_account_id
  where i.month_id = p_month_id
    and i.source_request_id is null
  order by i.position, i.created_at;
$$;

grant execute on function public.month_copy_candidates(uuid) to authenticated;
revoke execute on function public.month_copy_candidates(uuid) from anon;

-- ---------------------------------------------------------------------------
-- create_month
-- ---------------------------------------------------------------------------

-- p_copy_item_ids null = copy the suggested candidates; an array = copy exactly those items.
create function public.create_month(
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
      amount, minimum_amount, pay_plan, custom_amount, installment_no, due_date, note, position)
    values (
      v_uid, v_month.id, v_item.kind, v_item.debt_account_id, v_item.name, v_item.category, v_item.recurring,
      case v_item.kind
        when 'card' then null                                        -- new statement every month
        when 'loan' then coalesce(v_item.installment_amount, v_item.amount)
        else v_item.amount
      end,
      null,
      v_item.pay_plan,
      null,
      case when v_item.kind = 'loan' then coalesce(v_item.installment_no, 0) + 1 end,
      case
        when v_item.due_day is not null then make_date(p_year, p_month, least(v_item.due_day, v_last_day))
        when v_item.due_date is not null then (v_item.due_date + make_interval(months => v_shift))::date
      end,
      null,
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

revoke execute on function public.create_month(smallint, smallint, uuid, uuid[]) from public, anon;
grant execute on function public.create_month(smallint, smallint, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- set_month_status
-- ---------------------------------------------------------------------------

create function public.set_month_status(p_month_id uuid, p_status public.month_status)
returns public.months
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month public.months;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.months
     set status = p_status,
         closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) end
   where id = p_month_id and owner_id = auth.uid()
  returning * into v_month;

  if v_month.id is null then
    raise exception 'month_not_found' using errcode = 'P0002';
  end if;
  return v_month;
end;
$$;

revoke execute on function public.set_month_status(uuid, public.month_status) from public, anon;
grant execute on function public.set_month_status(uuid, public.month_status) to authenticated;

-- ---------------------------------------------------------------------------
-- month_summaries (business.md §12–§13)
-- ---------------------------------------------------------------------------

create view public.month_summaries with (security_invoker = true) as
with item_sums as (
  select
    month_id,
    coalesce(sum(planned_amount) filter (where kind = 'income'), 0)       as income_own,
    coalesce(sum(planned_amount) filter (where kind <> 'income'), 0)      as expense_plan,
    coalesce(sum(case when kind = 'card' then amount else planned_amount end)
               filter (where kind <> 'income'), 0)                        as expense_if_full,
    coalesce(sum(case when kind = 'card' then minimum_amount else planned_amount end)
               filter (where kind <> 'income'), 0)                        as expense_if_minimum,
    count(*) filter (where planned_amount is null)                        as missing_plan,
    count(*) filter (where kind <> 'income'
                       and (case when kind = 'card' then amount else planned_amount end) is null)
                                                                          as missing_if_full,
    count(*) filter (where kind <> 'income'
                       and (case when kind = 'card' then minimum_amount else planned_amount end) is null)
                                                                          as missing_if_minimum,
    coalesce(sum(planned_amount) filter (where category = 'savings'), 0)  as savings_total,
    coalesce(sum(coalesce(paid_amount, planned_amount))
               filter (where kind = 'income' and status = 'done'), 0)     as income_done,
    coalesce(sum(coalesce(paid_amount, planned_amount))
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
)
select
  m.id                                                   as month_id,
  m.year,
  m.month,
  m.status,
  coalesce(i.income_own, 0)::bigint                      as income_own,
  coalesce(p.from_people, 0)::bigint                     as from_people,
  coalesce(p.to_people, 0)::bigint                       as to_people,
  coalesce(i.expense_plan, 0)::bigint                    as expense_plan,
  coalesce(i.expense_if_full, 0)::bigint                 as expense_if_full,
  coalesce(i.expense_if_minimum, 0)::bigint              as expense_if_minimum,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_plan, 0) - coalesce(p.to_people, 0))::bigint       as balance_plan,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_if_full, 0) - coalesce(p.to_people, 0))::bigint    as balance_if_full,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_if_minimum, 0) - coalesce(p.to_people, 0))::bigint as balance_if_minimum,
  -- Money from people joins balance_actual once payment requests exist (migration 4).
  (coalesce(i.income_done, 0) - coalesce(i.expense_done, 0))::bigint         as balance_actual,
  coalesce(i.missing_plan, 0)::int                       as missing_plan,
  coalesce(i.missing_if_full, 0)::int                    as missing_if_full,
  coalesce(i.missing_if_minimum, 0)::int                 as missing_if_minimum,
  coalesce(i.savings_total, 0)::bigint                   as savings_total,
  coalesce(i.done_count, 0)::int                         as done_count,
  coalesce(i.total_count, 0)::int                        as total_count
from public.months m
left join item_sums i on i.month_id = m.id
left join people p on p.month_id = m.id;

revoke all on public.month_summaries from anon;
grant select on public.month_summaries to authenticated;
