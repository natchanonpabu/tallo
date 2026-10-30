begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local', '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',  '{}');

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 2026, 9);
insert into public.contacts (id, owner_id, name) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Unused'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'P''Nok'),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Chompoo'),
  ('c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Old friend');
insert into public.items (id, owner_id, month_id, kind, category, name, amount) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Solo', 1000),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 'spending', 'Shared', 900),
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'expense', 'spending', 'September', 500);

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select public.set_split('10000000-0000-0000-0000-000000000001', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-000000000002"}]');
select public.set_split('10000000-0000-0000-0000-000000000002', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-000000000002"}, {"contact_id": "c0000000-0000-0000-0000-000000000003"}]');
insert into public.offsets (month_id, contact_id, name, amount)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-000000000002', 'Lunch', 100);
select public.set_split('10000000-0000-0000-0000-000000000003', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-000000000004"}]');
select public.set_month_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'closed');

select lives_ok($$ select public.delete_contact('c0000000-0000-0000-0000-000000000001') $$,
                'an unused contact is deleted right away');
select throws_ok($$ select public.delete_contact('c0000000-0000-0000-0000-000000000002') $$,
                 '23503', 'contact_in_use', 'a contact with data needs p_force');
select lives_ok($$ select public.delete_contact('c0000000-0000-0000-0000-000000000002', true) $$,
                'p_force deletes a contact with data');
select is((select count(*) from public.offsets), 0::bigint, 'their offsets are gone');
select is((select count(*) from public.split_rules where item_id = '10000000-0000-0000-0000-000000000001'), 0::bigint,
          'a split that only had them is removed');
select results_eq(
  $$ select c.name, s.amount from public.shares s join public.contacts c on c.id = s.contact_id
     join public.split_rules r on r.id = s.rule_id where r.item_id = '10000000-0000-0000-0000-000000000002' $$,
  $$ values ('Chompoo', 300::bigint) $$,
  'a shared split keeps the other people');
select throws_ok($$ select public.delete_contact('c0000000-0000-0000-0000-000000000004', true) $$,
                 '22023', 'contact_in_closed_month', 'contacts in a closed month can only be archived');

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select throws_ok($$ select public.delete_contact('c0000000-0000-0000-0000-000000000003', true) $$,
                 'P0002', 'contact_not_found', 'Ball cannot delete Frong''s contacts');

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is((select count(*) from public.contacts), 2::bigint, 'Chompoo and the archived-only contact remain');

select * from finish();
rollback;
