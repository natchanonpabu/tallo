begin;
select plan(22);

-- Fixtures (as postgres) --------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local', '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',  '{}');

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10);

insert into public.contacts (id, owner_id, name) values
  ('c0000000-0000-0000-0000-00000000ba11', '11111111-1111-1111-1111-111111111111', 'P''Ball');

insert into public.debt_accounts (id, owner_id, kind, name, due_day, installment_amount, total_installments) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'card', 'KTC', 31, null, null),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'loan', 'KBank loan', 5, 501000, 10),
  ('d0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'loan', 'Done loan', null, 100000, 5);

insert into public.items (id, owner_id, month_id, kind, debt_account_id, category, recurring, name,
                          amount, minimum_amount, pay_plan, installment_no, due_date, position) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'card', 'd0000000-0000-0000-0000-000000000001', null, false, 'KTC', 1237400, 120000, 'minimum', null, '2026-10-31', 1),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'loan', 'd0000000-0000-0000-0000-000000000002', null, false, 'KBank loan', 501000, null, null, 3, '2026-10-05', 2),
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'loan', 'd0000000-0000-0000-0000-000000000003', null, false, 'Done loan', 100000, null, null, 5, '2026-10-20', 3),
  ('10000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', null, 'subscription', true, 'Youtube', 19800, null, null, null, null, 4),
  ('10000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', null, 'spending', false, 'Shopee', 328800, null, null, null, null, 5),
  ('10000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'income', null, null, true, 'Salary', 5335000, null, null, null, null, 6),
  ('10000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', null, 'pay_person', true, 'Chompoo', 100, null, null, null, null, 7);

-- Item 7 came from a payment request Ball sent to Frong.
insert into public.months (id, owner_id, year, month) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 2026, 10);
insert into public.contacts (id, owner_id, name, linked_user_id) values
  ('c0000000-0000-0000-0000-0000000f4096', '22222222-2222-2222-2222-222222222222', 'Frong', '11111111-1111-1111-1111-111111111111');
insert into public.payment_requests (id, sender_id, recipient_id, sender_month_id, sender_contact_id, year, month, status, version, total)
values ('e0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c0000000-0000-0000-0000-0000000f4096', 2026, 10, 'accepted', 1, 100);
update public.items set source_request_id = 'e0000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000007';

-- As Frong ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select public.set_split('10000000-0000-0000-0000-000000000004', null, 'fixed',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11", "amount": 13200}]',
                        true, null, true);

-- Summary of October.
-- expenses (plan): KTC minimum 120,000 + loans 601,000 + Youtube 19,800 + Shopee 328,800 + Chompoo 100
select results_eq(
  $$ select income_own, from_people, expense_plan, balance_plan, balance_if_full, balance_if_minimum,
            missing_plan, total_count
     from public.month_summaries where month_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values (5335000::bigint, 13200::bigint, 1069700::bigint, 4278500::bigint, 3161100::bigint,
             4278500::bigint, 0, 7) $$,
  'October summary: plan, full and minimum balances');

update public.items set status = 'done', done_at = now() where name in ('Salary', 'Shopee');
select is((select balance_actual from public.month_summaries
           where month_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          5006200::bigint, 'actual balance counts only done items');
select is((select done_count from public.month_summaries
           where month_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2, 'progress counts done items');

-- Copy candidates.
select results_eq(
  $$ select item_id::text, suggested from public.month_copy_candidates('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  $$ values ('10000000-0000-0000-0000-000000000001', true),
            ('10000000-0000-0000-0000-000000000002', true),
            ('10000000-0000-0000-0000-000000000003', false),
            ('10000000-0000-0000-0000-000000000004', true),
            ('10000000-0000-0000-0000-000000000005', false),
            ('10000000-0000-0000-0000-000000000006', true) $$,
  'candidates: cards, unfinished loans and recurring items are suggested; request items are hidden');

-- Copy November from October using the suggestions.
select lives_ok($$ select public.create_month(2026::smallint, 11::smallint, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
                'create_month copies the suggested items');

select is((select count(*) from public.items i join public.months m on m.id = i.month_id where m.month = 11),
          4::bigint, 'November has the 4 suggested items');
select results_eq(
  $$ select i.amount, i.minimum_amount, i.pay_plan::text, i.due_date, i.status::text
     from public.items i join public.months m on m.id = i.month_id where m.month = 11 and i.kind = 'card' $$,
  $$ values (null::bigint, null::bigint, 'minimum', '2026-11-30'::date, 'pending') $$,
  'card: amounts cleared, plan kept, due day clamped to the month end');
select results_eq(
  $$ select i.amount, i.installment_no, i.due_date
     from public.items i join public.months m on m.id = i.month_id where m.month = 11 and i.kind = 'loan' $$,
  $$ values (501000::bigint, 4, '2026-11-05'::date) $$,
  'loan: installment amount and next installment number');
select is((select i.amount from public.items i join public.months m on m.id = i.month_id
           where m.month = 11 and i.name = 'Salary'), 5335000::bigint, 'recurring income keeps its amount');
select is((select s.amount from public.shares s join public.months m on m.id = s.month_id where m.month = 11),
          13200::bigint, 'recurring split is copied with its shares');
select is((select count(*) from public.sub_items s join public.items i on i.id = s.item_id
           join public.months m on m.id = i.month_id where m.month = 11),
          0::bigint, 'sub-items are not copied');

select results_eq(
  $$ select missing_plan, missing_if_full, missing_if_minimum from public.month_summaries where month = 11 $$,
  $$ values (1, 1, 1) $$,
  'the copied card counts as not filled in');

-- Explicit selection and blank months.
select lives_ok($$ select public.create_month(2026::smallint, 12::smallint, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                                              array['10000000-0000-0000-0000-000000000005']::uuid[]) $$,
                'create_month with an explicit item list');
select is((select string_agg(i.name, ',') from public.items i join public.months m on m.id = i.month_id
           where m.month = 12), 'Shopee', 'only the chosen item is copied');
select lives_ok($$ select public.create_month(2027::smallint, 1::smallint) $$, 'create a blank month');
select is((select total_count from public.month_summaries where year = 2027), 0, 'blank month has no items');
select throws_ok($$ select public.create_month(2026::smallint, 11::smallint) $$,
                 '23505', null, 'a month can only exist once');

-- Status.
select is((select (public.set_month_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed')).closed_at is not null),
          true, 'closing sets closed_at');
select is((select (public.set_month_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active')).closed_at),
          null::timestamptz, 'reopening clears closed_at');

-- As Ball ----------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok($$ select public.create_month(2026::smallint, 11::smallint, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
                 'P0002', 'month_not_found', 'Ball cannot copy Frong''s month');
select throws_ok($$ select public.set_month_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed') $$,
                 'P0002', 'month_not_found', 'Ball cannot close Frong''s month');
select is((select count(*) from public.month_summaries where month_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0::bigint, 'Ball sees no summaries of Frong''s');

select * from finish();
rollback;
