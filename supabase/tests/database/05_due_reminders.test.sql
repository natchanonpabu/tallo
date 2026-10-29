begin;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local', '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',  '{}');

-- Frong is reminded 3 days ahead (default), Ball turned reminders off.
update public.profiles set notify_prefs = '{"due_soon": false}' where id = '22222222-2222-2222-2222-222222222222';

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 2026, 10);

insert into public.items (owner_id, month_id, kind, category, name, amount, due_date, status) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Due today',    100, '2026-10-20', 'pending'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Due in 3',     100, '2026-10-23', 'pending'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Due in 4',     100, '2026-10-24', 'pending'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Already paid', 100, '2026-10-21', 'done'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Overdue',      100, '2026-10-19', 'pending'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'income',  null,       'Salary',       100, '2026-10-21', 'pending'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'expense', 'spending', 'Ball bill',    100, '2026-10-21', 'pending');

select is(public.create_due_notifications('2026-10-20'), 2, 'two items fall in the 3-day window');
select results_eq(
  $$ select data ->> 'name', (data ->> 'days_left')::int from public.notifications order by data ->> 'name' $$,
  $$ values ('Due in 3', 3), ('Due today', 0) $$,
  'only pending, non-income items within the window, for users who want reminders');
select is(public.create_due_notifications('2026-10-20'), 0, 'running again does not duplicate');
select is(public.create_due_notifications('2026-10-21'), 1, 'the next day picks up the newly due item');

update public.profiles set due_remind_days = 0 where id = '11111111-1111-1111-1111-111111111111';
insert into public.items (owner_id, month_id, kind, category, name, amount, due_date) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Tomorrow', 100, '2026-10-22');
select is(public.create_due_notifications('2026-10-21'), 0, 'due_remind_days = 0 only reminds on the day');

select is((select count(*) from cron.job where jobname = 'tallo-due-reminders'), 1::bigint, 'the daily job is scheduled');

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select throws_ok($$ select public.create_due_notifications() $$, '42501', null,
                 'clients cannot trigger reminders');

select * from finish();
rollback;
