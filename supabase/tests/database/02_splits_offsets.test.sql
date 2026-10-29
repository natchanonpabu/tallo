begin;
select plan(26);

-- Fixtures (as postgres) --------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local', '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',  '{}');

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10);

insert into public.contacts (id, owner_id, name) values
  ('c0000000-0000-0000-0000-00000000ba11', '11111111-1111-1111-1111-111111111111', 'P''Ball'),
  ('c0000000-0000-0000-0000-0000000c4090', '11111111-1111-1111-1111-111111111111', 'Chompoo'),
  ('c0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Ball''s own contact');

insert into public.debt_accounts (id, owner_id, kind, name) values
  ('d0000000-0000-0000-0000-00000000047c', '11111111-1111-1111-1111-111111111111', 'card', 'KTC');

insert into public.items (id, owner_id, month_id, kind, debt_account_id, category, name, amount) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'card', 'd0000000-0000-0000-0000-00000000047c', null, 'KTC', 1237400),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', 'Food', 177100),
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', '7 Eleven', 135800),
  ('10000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', 'Fortuner', 297400),
  ('10000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', 'Dumbell', 44700),
  ('10000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'subscription', 'Youtube', 19800),
  ('10000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', 'Odd', 101),
  ('10000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', '60/40', 1000),
  ('10000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', null, 'spending', 'Thirds', 100),
  ('10000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'income', null, null, 'Salary', 5335000);

insert into public.sub_items (id, owner_id, item_id, name, amount) values
  ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'P''Ball part', 805000);

-- As Frong ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- "All of it is theirs": sub-item level, one person, not me.
select lives_ok($$ select public.set_split('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
                    'equal', '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11"}]', false) $$,
                'split a sub-item fully to one person');
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.sub_item_id = '50000000-0000-0000-0000-000000000001'),
          805000::bigint, 'P''Ball gets the whole sub-item');

-- Item-level rule only splits the unallocated part (1,237,400 - 805,000 = 432,400).
select public.set_split('10000000-0000-0000-0000-000000000001', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-0000000c4090"}]');
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000001' and r.sub_item_id is null),
          216200::bigint, 'item-level split uses only the unallocated amount');

-- Adding a sub-item shrinks the unallocated part and re-splits automatically.
insert into public.sub_items (item_id, name, amount)
values ('10000000-0000-0000-0000-000000000001', 'Mine', 32400);
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000001' and r.sub_item_id is null),
          200000::bigint, 'item-level share follows new sub-items');

-- Bulk "Chompoo / 2": four items halved in one call (sheet column I–J).
select is((select count(*) from public.apply_split(
             '[{"item_id": "10000000-0000-0000-0000-000000000002"},
               {"item_id": "10000000-0000-0000-0000-000000000003"},
               {"item_id": "10000000-0000-0000-0000-000000000004"},
               {"item_id": "10000000-0000-0000-0000-000000000005"}]',
             'equal', '[{"contact_id": "c0000000-0000-0000-0000-0000000c4090"}]')),
          4::bigint, 'apply_split creates one rule per target');
select is((select sum(s.amount)::bigint from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
                               '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005')),
          327500::bigint, 'Chompoo''s half matches the sheet (3,275.00)');

-- Rounding: the remainder satang stays with me.
select public.set_split('10000000-0000-0000-0000-000000000007', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11"}]');
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000007'),
          50::bigint, 'equal split of 1.01 gives them 0.50 (I keep 0.51)');

select public.set_split('10000000-0000-0000-0000-000000000009', null, 'ratio',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11", "weight": 1},
                          {"contact_id": "c0000000-0000-0000-0000-0000000c4090", "weight": 1}]', true, 1);
select is((select sum(s.amount)::bigint from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000009'),
          66::bigint, 'three-way ratio of 1.00 gives 0.33 each, I keep 0.34');

select public.set_split('10000000-0000-0000-0000-000000000008', null, 'ratio',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11", "weight": 40}]', true, 60);
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000008'),
          400::bigint, '60:40 ratio');

-- Fixed amounts.
select public.set_split('10000000-0000-0000-0000-000000000006', null, 'fixed',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11", "amount": 13200}]');
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000006'),
          13200::bigint, 'fixed share (Youtube 132 of 198)');
select throws_ok(
  $$ select public.set_split('10000000-0000-0000-0000-000000000006', null, 'fixed',
                             '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11", "amount": 20000}]') $$,
  'P0001', 'split_exceeds_amount', 'fixed shares cannot exceed the amount');
select throws_ok(
  $$ update public.items set amount = 10000 where id = '10000000-0000-0000-0000-000000000006' $$,
  'P0001', 'split_exceeds_amount', 'lowering an amount below its fixed shares is rejected');

-- Replacing a rule replaces its shares.
select public.set_split('10000000-0000-0000-0000-000000000006', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-0000000c4090"}]', false);
select is((select count(*) from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000006'),
          1::bigint, 'set_split replaces the previous shares');

-- Amount changes re-split.
update public.items set amount = 200000 where id = '10000000-0000-0000-0000-000000000002';
select is((select amount from public.shares s join public.split_rules r on r.id = s.rule_id
           where r.item_id = '10000000-0000-0000-0000-000000000002'),
          100000::bigint, 'changing an item amount re-splits');

select lives_ok($$ select public.clear_split('10000000-0000-0000-0000-000000000006') $$, 'clear_split');
select is((select count(*) from public.split_rules where item_id = '10000000-0000-0000-0000-000000000006'),
          0::bigint, 'clear_split removes the rule');

-- Validation.
select throws_ok(
  $$ select public.set_split('10000000-0000-0000-0000-000000000010', null, 'equal',
                             '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11"}]') $$,
  '22023', 'cannot_split_income', 'income cannot be split');
select throws_ok(
  $$ select public.set_split('10000000-0000-0000-0000-000000000002', null, 'equal',
                             '[{"contact_id": "c0000000-0000-0000-0000-00000000000b"}]') $$,
  'P0002', 'contact_not_found', 'cannot split with someone else''s contact');
select throws_ok(
  $$ insert into public.shares (owner_id, month_id, rule_id, contact_id, amount)
     select owner_id, month_id, id, 'c0000000-0000-0000-0000-00000000ba11', 1 from public.split_rules limit 1 $$,
  '42501', null, 'shares cannot be written directly');

-- Offsets and balances (business.md §9).
insert into public.offsets (month_id, contact_id, name, amount) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 'Dad Insurance', 385100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 'Fortuner', 490900);

-- P'Ball: 805,000 + 50 + 33 + 400 = 805,483 receivable, 876,000 offsets.
select results_eq(
  $$ select receivable, offset_total, net from public.month_person_balances
     where contact_id = 'c0000000-0000-0000-0000-00000000ba11' $$,
  $$ values (805483::bigint, 876000::bigint, -70517::bigint) $$,
  'P''Ball balance nets shares against offsets');

select throws_ok(
  $$ insert into public.offsets (month_id, contact_id, name, amount)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000000b', 'Nope', 1) $$,
  '42501', null, 'offsets need my own contact');

-- As Ball ----------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select count(*) from public.shares), 0::bigint, 'Ball cannot read Frong''s shares');
select is((select count(*) from public.month_person_balances), 0::bigint, 'Ball cannot read Frong''s balances');
select throws_ok(
  $$ select public.set_split('10000000-0000-0000-0000-000000000002', null, 'equal',
                             '[{"contact_id": "c0000000-0000-0000-0000-00000000000b"}]') $$,
  'P0002', 'item_not_found', 'Ball cannot split Frong''s items');

-- Closed month -----------------------------------------------------------------

reset role;
update public.months set status = 'closed' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$ select public.set_split('10000000-0000-0000-0000-000000000003', null, 'equal',
                             '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11"}]') $$,
  'P0001', 'month_closed', 'splits are locked in a closed month');
select throws_ok(
  $$ delete from public.offsets where name = 'Fortuner' $$,
  'P0001', 'month_closed', 'offsets are locked in a closed month');

select * from finish();
rollback;
