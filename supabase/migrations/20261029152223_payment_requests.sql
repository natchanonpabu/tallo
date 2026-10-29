-- Payment requests between users and in-app notifications.
-- See docs/design.md §3.8, §3.9, §6.2 and business.md §11.
-- The recipient never reads the sender's tables: request_lines is a per-version snapshot.

create type public.request_status as enum
  ('draft', 'sent', 'questioned', 'accepted', 'paid', 'received', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.payment_requests (
  id                 uuid primary key default gen_random_uuid(),
  sender_id          uuid not null references public.profiles on delete cascade,
  recipient_id       uuid not null references public.profiles on delete cascade,
  sender_month_id    uuid not null references public.months on delete cascade,
  sender_contact_id  uuid not null references public.contacts,
  year               smallint not null,
  month              smallint not null,
  status             public.request_status not null default 'draft',
  version            int not null default 0,
  total              bigint not null default 0,
  recipient_item_id  uuid references public.items on delete set null,
  sent_at            timestamptz,
  accepted_at        timestamptz,
  paid_at            timestamptz,
  received_at        timestamptz,
  created_at         timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index payment_requests_one_open on public.payment_requests (sender_month_id, sender_contact_id)
  where status <> 'cancelled';
create index payment_requests_recipient_idx on public.payment_requests (recipient_id, status);
create index payment_requests_sender_idx on public.payment_requests (sender_id, status);

alter table public.items
  add constraint items_source_request_fk
  foreign key (source_request_id) references public.payment_requests on delete set null;

create table public.request_lines (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.payment_requests on delete cascade,
  version      int not null,
  kind         text not null check (kind in ('share', 'offset')),
  group_label  text,
  label        text not null,
  amount       bigint not null,
  position     int not null,
  check ((kind = 'share') = (amount >= 0))
);
create index request_lines_request_idx on public.request_lines (request_id, version, position);

create table public.request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.payment_requests on delete cascade,
  actor_id    uuid not null references public.profiles on delete cascade,
  type        text not null check (type in ('sent', 'resent', 'questioned', 'comment', 'accepted',
                                            'paid', 'received', 'cancelled')),
  line_id     uuid references public.request_lines on delete set null,
  message     text,
  created_at  timestamptz not null default clock_timestamp()
);
create index request_events_request_idx on public.request_events (request_id, created_at);

-- UI renders the text from type + data, so nothing user-facing is stored here.
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  type        text not null,
  actor_id    uuid references public.profiles on delete set null,
  request_id  uuid references public.payment_requests on delete cascade,
  item_id     uuid references public.items on delete cascade,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default clock_timestamp()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.payment_requests enable row level security;
alter table public.request_lines enable row level security;
alter table public.request_events enable row level security;
alter table public.notifications enable row level security;

create function public.can_see_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payment_requests r
    where r.id = p_request_id
      and (r.sender_id = (select auth.uid())
           or (r.recipient_id = (select auth.uid()) and r.status <> 'draft'))
  );
$$;

create policy "payment_requests: participants" on public.payment_requests
  for select to authenticated
  using (sender_id = (select auth.uid())
         or (recipient_id = (select auth.uid()) and status <> 'draft'));
create policy "request_lines: participants" on public.request_lines
  for select to authenticated using (public.can_see_request(request_id));
create policy "request_events: participants" on public.request_events
  for select to authenticated using (public.can_see_request(request_id));

create policy "notifications: own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: mark read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Everything except reading (and marking notifications read) goes through the RPCs below.
revoke all on public.payment_requests, public.request_lines, public.request_events, public.notifications
  from anon, authenticated;
grant select on public.payment_requests, public.request_lines, public.request_events, public.notifications
  to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Profiles of people I exchange requests with are visible too, even without a contact.
create or replace view public.public_profiles as
select p.id, p.display_name, p.color
from public.profiles p
where p.id = (select auth.uid())
   or exists (select 1 from public.contacts c
              where c.owner_id = (select auth.uid()) and c.linked_user_id = p.id)
   or exists (select 1 from public.contacts c
              where c.owner_id = p.id and c.linked_user_id = (select auth.uid()))
   or exists (select 1 from public.payment_requests r
              where (r.sender_id = p.id and r.recipient_id = (select auth.uid()))
                 or (r.recipient_id = p.id and r.sender_id = (select auth.uid())));

alter publication supabase_realtime add table public.notifications, public.payment_requests;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Respects profiles.notify_prefs: {"<type>": false} turns a type off.
create function public.notify(
  p_user_id uuid, p_type text, p_actor_id uuid, p_request_id uuid, p_item_id uuid, p_data jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select (notify_prefs ->> p_type)::boolean from public.profiles where id = p_user_id), true) then
    insert into public.notifications (user_id, type, actor_id, request_id, item_id, data)
    values (p_user_id, p_type, p_actor_id, p_request_id, p_item_id, coalesce(p_data, '{}'));
  end if;
end;
$$;

revoke execute on function public.notify(uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- Locks a request the caller takes part in, checking their role and the allowed statuses.
create function public.lock_request(
  p_request_id uuid, p_role text, p_allowed public.request_status[])
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.id is null
     or (p_role = 'sender' and v_req.sender_id <> auth.uid())
     or (p_role = 'recipient' and (v_req.recipient_id <> auth.uid() or v_req.status = 'draft'))
     or (p_role = 'any' and auth.uid() not in (v_req.sender_id, v_req.recipient_id)) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if not (v_req.status = any (p_allowed)) then
    raise exception 'request_wrong_status' using errcode = '22023',
      detail = format('status is %s', v_req.status);
  end if;
  return v_req;
end;
$$;

revoke execute on function public.lock_request(uuid, text, public.request_status[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: sender side
-- ---------------------------------------------------------------------------

create function public.send_request(p_month_id uuid, p_contact_id uuid, p_note text default null)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_month public.months;
  v_contact public.contacts;
  v_net bigint;
  v_req public.payment_requests;
  v_resend boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_month from public.months where id = p_month_id and owner_id = v_uid;
  if v_month.id is null then
    raise exception 'month_not_found' using errcode = 'P0002';
  end if;
  if v_month.status = 'closed' then
    raise exception 'month_closed';
  end if;

  select * into v_contact from public.contacts where id = p_contact_id and owner_id = v_uid;
  if v_contact.id is null then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;
  if v_contact.linked_user_id is null then
    raise exception 'contact_not_linked' using errcode = '22023';
  end if;

  select net into v_net from public.month_person_balances
   where month_id = p_month_id and contact_id = p_contact_id;
  if coalesce(v_net, 0) <= 0 then
    raise exception 'net_not_positive' using errcode = '22023';
  end if;

  select * into v_req from public.payment_requests
   where sender_month_id = p_month_id and sender_contact_id = p_contact_id and status <> 'cancelled'
   for update;
  v_resend := v_req.id is not null;

  if v_req.status in ('paid', 'received') then
    raise exception 'request_already_paid' using errcode = '22023';
  end if;

  if not v_resend then
    insert into public.payment_requests
      (sender_id, recipient_id, sender_month_id, sender_contact_id, year, month)
    values (v_uid, v_contact.linked_user_id, p_month_id, p_contact_id, v_month.year, v_month.month)
    returning * into v_req;
  end if;

  update public.payment_requests
     set version = version + 1,
         total = v_net,
         status = 'sent',
         sent_at = now()
   where id = v_req.id
  returning * into v_req;

  insert into public.request_lines (request_id, version, kind, group_label, label, amount, position)
  select v_req.id, v_req.version, kind, group_label, label, amount,
         row_number() over (order by sort_group, sort_pos, label)
  from (
    select 'share' as kind,
           case when si.id is not null then i.name end as group_label,
           coalesce(si.name, i.name) as label,
           s.amount,
           0 as sort_group,
           i.position * 10000 + coalesce(si.position, 0) as sort_pos
    from public.shares s
    join public.split_rules r on r.id = s.rule_id
    join public.items i on i.id = r.item_id
    left join public.sub_items si on si.id = r.sub_item_id
    where s.month_id = p_month_id and s.contact_id = p_contact_id and s.amount > 0
    union all
    select 'offset', null, o.name, -o.amount, 1, o.position
    from public.offsets o
    where o.month_id = p_month_id and o.contact_id = p_contact_id
  ) lines;

  insert into public.request_events (request_id, actor_id, type, message)
  values (v_req.id, v_uid, case when v_resend then 'resent' else 'sent' end, nullif(trim(p_note), ''));

  perform public.notify(v_req.recipient_id,
                        case when v_resend then 'request_updated' else 'request_received' end,
                        v_uid, v_req.id, null,
                        jsonb_build_object('total', v_req.total, 'version', v_req.version,
                                           'year', v_req.year, 'month', v_req.month));
  return v_req;
end;
$$;

create function public.cancel_request(p_request_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
  v_item_id uuid;
begin
  v_req := public.lock_request(p_request_id, 'sender', array['sent', 'questioned', 'accepted']::public.request_status[]);
  v_item_id := v_req.recipient_item_id;

  update public.payment_requests
     set status = 'cancelled', recipient_item_id = null
   where id = v_req.id
  returning * into v_req;

  -- The expense the recipient got from accepting goes away with the request.
  if v_item_id is not null then
    delete from public.items where id = v_item_id;
  end if;

  insert into public.request_events (request_id, actor_id, type) values (v_req.id, auth.uid(), 'cancelled');
  perform public.notify(v_req.recipient_id, 'request_cancelled', auth.uid(), v_req.id, null,
                        jsonb_build_object('total', v_req.total));
  return v_req;
end;
$$;

create function public.confirm_request_received(p_request_id uuid)
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

  insert into public.request_events (request_id, actor_id, type) values (v_req.id, auth.uid(), 'received');
  perform public.notify(v_req.recipient_id, 'request_received_confirmed', auth.uid(), v_req.id, null,
                        jsonb_build_object('total', v_req.total));
  return v_req;
end;
$$;

-- Requests of a month that are not settled yet; the UI warns before closing it (business.md §10).
create function public.month_open_requests(p_month_id uuid)
returns setof public.payment_requests
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.payment_requests
  where sender_month_id = p_month_id and status not in ('received', 'cancelled')
  order by created_at;
$$;

-- ---------------------------------------------------------------------------
-- RPC: recipient side
-- ---------------------------------------------------------------------------

create function public.accept_request(p_request_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.payment_requests;
  v_month_id uuid;
  v_contact public.contacts;
  v_sender public.profiles;
  v_item_id uuid;
begin
  v_req := public.lock_request(p_request_id, 'recipient', array['sent', 'questioned']::public.request_status[]);
  select * into v_sender from public.profiles where id = v_req.sender_id;

  -- Same month on the recipient's side, created as a draft if needed.
  select id into v_month_id from public.months
   where owner_id = v_uid and year = v_req.year and month = v_req.month;
  if v_month_id is null then
    insert into public.months (owner_id, year, month)
    values (v_uid, v_req.year, v_req.month)
    returning id into v_month_id;
  end if;

  -- A contact for the sender on the recipient's side.
  select * into v_contact from public.contacts
   where owner_id = v_uid and linked_user_id = v_req.sender_id;
  if v_contact.id is null then
    insert into public.contacts (owner_id, name, color, linked_user_id)
    values (v_uid, v_sender.display_name, v_sender.color, v_req.sender_id)
    returning * into v_contact;
  end if;

  select id into v_item_id from public.items where id = v_req.recipient_item_id;
  if v_item_id is null then
    insert into public.items (owner_id, month_id, kind, category, name, amount, source_request_id, position)
    values (v_uid, v_month_id, 'expense', 'pay_person', v_contact.name, v_req.total, v_req.id,
            coalesce((select max(position) + 1 from public.items where month_id = v_month_id), 0))
    returning id into v_item_id;
  else
    update public.items set amount = v_req.total where id = v_item_id;
  end if;

  update public.payment_requests
     set status = 'accepted', accepted_at = now(), recipient_item_id = v_item_id
   where id = v_req.id
  returning * into v_req;

  insert into public.request_events (request_id, actor_id, type) values (v_req.id, v_uid, 'accepted');
  perform public.notify(v_req.sender_id, 'request_accepted', v_uid, v_req.id, null,
                        jsonb_build_object('total', v_req.total));
  return v_req;
end;
$$;

create function public.mark_request_paid(p_request_id uuid, p_paid_amount bigint default null)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
begin
  v_req := public.lock_request(p_request_id, 'recipient', array['accepted']::public.request_status[]);
  if p_paid_amount is not null and p_paid_amount < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  update public.payment_requests
     set status = 'paid', paid_at = now()
   where id = v_req.id
  returning * into v_req;

  update public.items
     set status = 'done', done_at = now(), paid_amount = coalesce(p_paid_amount, v_req.total)
   where id = v_req.recipient_item_id;

  insert into public.request_events (request_id, actor_id, type) values (v_req.id, auth.uid(), 'paid');
  perform public.notify(v_req.sender_id, 'request_paid', auth.uid(), v_req.id, null,
                        jsonb_build_object('total', v_req.total,
                                           'paid_amount', coalesce(p_paid_amount, v_req.total)));
  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: both sides
-- ---------------------------------------------------------------------------

-- A question from the recipient moves the request to "questioned"; anything else is a comment.
create function public.comment_request(
  p_request_id uuid, p_message text, p_line_id uuid default null, p_is_question boolean default false)
returns public.request_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.payment_requests;
  v_event public.request_events;
  v_question boolean;
begin
  v_req := public.lock_request(p_request_id, 'any',
                               array['sent', 'questioned', 'accepted', 'paid', 'received']::public.request_status[]);
  if nullif(trim(p_message), '') is null then
    raise exception 'message_required' using errcode = '22023';
  end if;
  if p_line_id is not null
     and not exists (select 1 from public.request_lines where id = p_line_id and request_id = v_req.id) then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;

  v_question := p_is_question and v_uid = v_req.recipient_id and v_req.status in ('sent', 'accepted');
  if v_question then
    update public.payment_requests set status = 'questioned' where id = v_req.id;
  end if;

  insert into public.request_events (request_id, actor_id, type, line_id, message)
  values (v_req.id, v_uid, case when v_question then 'questioned' else 'comment' end, p_line_id, trim(p_message))
  returning * into v_event;

  perform public.notify(case when v_uid = v_req.sender_id then v_req.recipient_id else v_req.sender_id end,
                        case when v_question then 'request_questioned' else 'request_comment' end,
                        v_uid, v_req.id, null,
                        jsonb_build_object('event_id', v_event.id, 'line_id', p_line_id));
  return v_event;
end;
$$;

revoke execute on function public.send_request(uuid, uuid, text) from public, anon;
revoke execute on function public.cancel_request(uuid) from public, anon;
revoke execute on function public.confirm_request_received(uuid) from public, anon;
revoke execute on function public.month_open_requests(uuid) from public, anon;
revoke execute on function public.accept_request(uuid) from public, anon;
revoke execute on function public.mark_request_paid(uuid, bigint) from public, anon;
revoke execute on function public.comment_request(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.send_request(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.confirm_request_received(uuid) to authenticated;
grant execute on function public.month_open_requests(uuid) to authenticated;
grant execute on function public.accept_request(uuid) to authenticated;
grant execute on function public.mark_request_paid(uuid, bigint) to authenticated;
grant execute on function public.comment_request(uuid, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- month_summaries: money received from people now counts as actual cash
-- ---------------------------------------------------------------------------

create or replace view public.month_summaries with (security_invoker = true) as
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
  coalesce(i.expense_plan, 0)::bigint                    as expense_plan,
  coalesce(i.expense_if_full, 0)::bigint                 as expense_if_full,
  coalesce(i.expense_if_minimum, 0)::bigint              as expense_if_minimum,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_plan, 0) - coalesce(p.to_people, 0))::bigint       as balance_plan,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_if_full, 0) - coalesce(p.to_people, 0))::bigint    as balance_if_full,
  (coalesce(i.income_own, 0) + coalesce(p.from_people, 0)
     - coalesce(i.expense_if_minimum, 0) - coalesce(p.to_people, 0))::bigint as balance_if_minimum,
  (coalesce(i.income_done, 0) + coalesce(r.received_total, 0)
     - coalesce(i.expense_done, 0))::bigint                                  as balance_actual,
  coalesce(i.missing_plan, 0)::int                       as missing_plan,
  coalesce(i.missing_if_full, 0)::int                    as missing_if_full,
  coalesce(i.missing_if_minimum, 0)::int                 as missing_if_minimum,
  coalesce(i.savings_total, 0)::bigint                   as savings_total,
  (coalesce(i.done_count, 0) + coalesce(r.received_count, 0))::int  as done_count,
  (coalesce(i.total_count, 0) + coalesce(r.request_count, 0))::int  as total_count
from public.months m
left join item_sums i on i.month_id = m.id
left join people p on p.month_id = m.id
left join requests r on r.month_id = m.id;
