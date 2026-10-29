-- Daily in-app reminders for unpaid items that are due soon (business.md §11.3).
-- One "due_soon" notification per item; the window is profiles.due_remind_days.

create extension if not exists pg_cron with schema pg_catalog;

create unique index notifications_one_due_soon on public.notifications (user_id, item_id)
  where type = 'due_soon';

-- p_today defaults to today in Bangkok; tests pass a fixed date.
create function public.create_due_notifications(p_today date default null)
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
         jsonb_build_object('name', i.name, 'due_date', i.due_date, 'amount', i.planned_amount,
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

revoke execute on function public.create_due_notifications(date) from public, anon, authenticated;

-- 01:00 UTC = 08:00 Asia/Bangkok.
select cron.schedule('tallo-due-reminders', '0 1 * * *', 'select public.create_due_notifications()');
