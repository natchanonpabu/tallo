-- Settlements: tick that a person has paid me (or I paid them) for a month, with or without a
-- payment request (business.md §10). One row per person per month; amount is signed like `net`
-- (+ they paid me, − I paid them). Confirming a payment request writes the same row.

create table public.settlements (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  month_id    uuid not null references public.months on delete cascade,
  contact_id  uuid not null references public.contacts,
  amount      bigint not null,
  settled_at  timestamptz not null default now(),
  unique (month_id, contact_id)
);
create index settlements_contact_idx on public.settlements (contact_id);

alter table public.settlements enable row level security;

-- Like ticking an item done, this stays allowed in a closed month.
create policy "settlements: read own" on public.settlements
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "settlements: delete own" on public.settlements
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "settlements: create own" on public.settlements
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.months m where m.id = month_id and m.owner_id = (select auth.uid()))
    and exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = (select auth.uid()))
  );
create policy "settlements: update own" on public.settlements
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.settlements from anon, authenticated;
grant select, delete on public.settlements to authenticated;
grant insert (month_id, contact_id, amount, settled_at) on public.settlements to authenticated;
grant update (amount, settled_at) on public.settlements to authenticated;

-- Existing received requests become settlements.
insert into public.settlements (owner_id, month_id, contact_id, amount, settled_at)
select sender_id, sender_month_id, sender_contact_id, total, coalesce(received_at, now())
from public.payment_requests
where status = 'received'
on conflict (month_id, contact_id) do nothing;

-- ---------------------------------------------------------------------------
-- confirm_request_received also ticks the person as settled
-- ---------------------------------------------------------------------------

create or replace function public.confirm_request_received(p_request_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
begin
  v_req := public.lock_request(p_request_id, 'sender', array['paid']::public.request_status[]);

  update public.payment_requests
     set status = 'received', received_at = now()
   where id = v_req.id
  returning * into v_req;

  insert into public.settlements (owner_id, month_id, contact_id, amount, settled_at)
  values (v_req.sender_id, v_req.sender_month_id, v_req.sender_contact_id, v_req.total, now())
  on conflict (month_id, contact_id) do update set amount = excluded.amount, settled_at = excluded.settled_at;

  insert into public.request_events (request_id, actor_id, type) values (v_req.id, auth.uid(), 'received');
  perform public.notify(v_req.recipient_id, 'request_received_confirmed', auth.uid(), v_req.id, null,
                        jsonb_build_object('total', v_req.total));
  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- month_summaries: settlements drive actual cash and progress for people
-- ---------------------------------------------------------------------------

create or replace view public.month_summaries with (security_invoker = true) as
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
  select b.month_id,
         coalesce(sum(b.net) filter (where b.net > 0), 0)  as from_people,
         coalesce(-sum(b.net) filter (where b.net < 0), 0) as to_people,
         count(*) filter (where b.net <> 0)                as people_count,
         count(s.id) filter (where b.net <> 0)             as settled_count
  from public.month_person_balances b
  left join public.settlements s on s.month_id = b.month_id and s.contact_id = b.contact_id
  group by b.month_id
),
settled as (
  select month_id, sum(amount) as settled_total
  from public.settlements
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
  coalesce(i.expense_total, 0)::bigint                   as expense_total,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_total, 0) - coalesce(p.to_people, 0))::bigint      as balance,
  (coalesce(i.income_done, 0) + coalesce(st.settled_total, 0)
     - coalesce(i.expense_done, 0))::bigint                                  as balance_actual,
  coalesce(i.missing_count, 0)::int                      as missing_count,
  coalesce(i.savings_total, 0)::bigint                   as savings_total,
  (coalesce(i.done_count, 0) + coalesce(p.settled_count, 0))::int   as done_count,
  (coalesce(i.total_count, 0) + coalesce(p.people_count, 0))::int   as total_count
from public.months m
left join item_sums i on i.month_id = m.id
left join people p on p.month_id = m.id
left join settled st on st.month_id = m.id;
