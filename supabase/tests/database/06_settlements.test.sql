begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local', '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',  '{}');

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10);
insert into public.contacts (id, owner_id, name) values
  ('c0000000-0000-0000-0000-00000000ba11', '11111111-1111-1111-1111-111111111111', 'P''Ball'),
  ('c0000000-0000-0000-0000-0000000c4090', '11111111-1111-1111-1111-111111111111', 'Chompoo');
insert into public.items (id, owner_id, month_id, kind, category, name, amount) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'KBank loan', 501000);

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select public.set_split('10000000-0000-0000-0000-000000000001', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11"}]', false);
-- Chompoo paid something for me: I owe her 1,000.
insert into public.offsets (month_id, contact_id, name, amount)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090', 'Lunch', 100000);

select results_eq(
  $$ select done_count, total_count, balance_actual from public.month_summaries $$,
  $$ values (0, 3, 0::bigint) $$,
  'people with a non-zero balance count as things to settle');

insert into public.settlements (month_id, contact_id, amount)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 501000);
select results_eq(
  $$ select done_count, balance_actual from public.month_summaries $$,
  $$ values (1, 501000::bigint) $$,
  'ticking P''Ball as paid counts his money as received');

insert into public.settlements (month_id, contact_id, amount)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090', -100000);
select results_eq(
  $$ select done_count, balance_actual from public.month_summaries $$,
  $$ values (2, 401000::bigint) $$,
  'paying Chompoo back counts as money out');

select throws_ok(
  $$ insert into public.settlements (month_id, contact_id, amount)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 1) $$,
  '23505', null, 'one settlement per person per month');

delete from public.settlements where contact_id = 'c0000000-0000-0000-0000-0000000c4090';
select is((select done_count from public.month_summaries), 1, 'unticking removes the settlement');

-- Still allowed after the month is closed.
select public.set_month_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed');
select lives_ok(
  $$ insert into public.settlements (month_id, contact_id, amount)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090', -100000) $$,
  'people can be ticked in a closed month');

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is((select count(*) from public.settlements), 0::bigint, 'Ball cannot see Frong''s settlements');
select throws_ok(
  $$ insert into public.settlements (month_id, contact_id, amount)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 1) $$,
  '42501', null, 'Ball cannot tick people in Frong''s month');

select * from finish();
rollback;
