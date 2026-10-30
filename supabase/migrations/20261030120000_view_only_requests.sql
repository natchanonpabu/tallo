-- Payment requests become view-only statements (decided 2026-10-30, business.md §11).
-- They can be sent whichever way the money goes (total is signed like `net`: + they owe me,
-- − I owe them). There is no accept / paid / received step any more; who has paid is ticked with
-- settlements on each side. Comments and questions stay.

drop function public.accept_request(uuid);
drop function public.mark_request_paid(uuid, bigint);
drop function public.confirm_request_received(uuid);
drop function public.month_open_requests(uuid);

-- Requests left in the old flow become plain sent statements.
update public.payment_requests
   set status = 'sent'
 where status in ('accepted', 'paid', 'received');

create or replace function public.send_request(p_month_id uuid, p_contact_id uuid, p_note text default null)
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
  if coalesce(v_net, 0) = 0 then
    raise exception 'net_is_zero' using errcode = '22023';
  end if;

  select * into v_req from public.payment_requests
   where sender_month_id = p_month_id and sender_contact_id = p_contact_id and status <> 'cancelled'
   for update;
  v_resend := v_req.id is not null;

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

create or replace function public.cancel_request(p_request_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
  v_item_id uuid;
begin
  v_req := public.lock_request(p_request_id, 'sender', array['sent', 'questioned']::public.request_status[]);
  v_item_id := v_req.recipient_item_id;

  update public.payment_requests
     set status = 'cancelled', recipient_item_id = null
   where id = v_req.id
  returning * into v_req;

  -- Requests accepted under the old flow may still have an expense on the recipient's side.
  if v_item_id is not null then
    delete from public.items where id = v_item_id;
  end if;

  insert into public.request_events (request_id, actor_id, type) values (v_req.id, auth.uid(), 'cancelled');
  perform public.notify(v_req.recipient_id, 'request_cancelled', auth.uid(), v_req.id, null,
                        jsonb_build_object('total', v_req.total));
  return v_req;
end;
$$;

create or replace function public.comment_request(
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
  v_req := public.lock_request(p_request_id, 'any', array['sent', 'questioned']::public.request_status[]);
  if nullif(trim(p_message), '') is null then
    raise exception 'message_required' using errcode = '22023';
  end if;
  if p_line_id is not null
     and not exists (select 1 from public.request_lines where id = p_line_id and request_id = v_req.id) then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;

  v_question := p_is_question and v_uid = v_req.recipient_id;
  if v_question and v_req.status = 'sent' then
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
