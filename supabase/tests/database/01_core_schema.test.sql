begin;
select plan(22);

-- Fixtures (as postgres) --------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local', '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',  '{}');

select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          'Frong', 'profile is created from signup metadata');
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
          'ball', 'display name falls back to the email prefix');
select matches((select friend_code from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
               '^[A-HJ-NP-Z2-9]{8}$', 'friend code uses the look-alike-free alphabet');

update public.profiles set friend_code = 'FRONG234' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set friend_code = 'BALL2345' where id = '22222222-2222-2222-2222-222222222222';

-- A month of Frong's with a known id, for cross-user checks.
insert into public.months (id, owner_id, year, month)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 9);

-- As Frong ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.months (year, month) values (2026, 10);
insert into public.debt_accounts (kind, name) values ('card', 'KTC');

insert into public.items (month_id, kind, debt_account_id, name, amount)
select m.id, 'card', d.id, 'KTC', 1237400
from public.months m, public.debt_accounts d
where m.month = 10;

select lives_ok(
  $$ insert into public.items (month_id, kind, debt_account_id, name)
     select m.id, 'card', d.id, 'Not filled' from public.months m, public.debt_accounts d where m.month = 10 $$,
  'a card can be added before its amount is known');

insert into public.sub_items (item_id, name, amount)
select id, 'P''Ball', 805000 from public.items where name = 'KTC';
select is((select unallocated from public.item_totals t join public.items i on i.id = t.item_id where i.name = 'KTC'), 432400::bigint,
          'unallocated is item amount minus sub-items');

select throws_ok(
  $$ insert into public.items (month_id, kind, name, amount)
     select id, 'card', 'No account', 1 from public.months where month = 10 $$,
  '23514', null, 'a card needs a debt account');
select throws_ok(
  $$ insert into public.items (month_id, kind, name, amount)
     select id, 'expense', 'Shopee', 328800 from public.months where month = 10 $$,
  '23514', null, 'an expense needs a category');
select throws_ok(
  $$ update public.items set source_request_id = gen_random_uuid() $$,
  '42501', null, 'source_request_id is not writable by clients');
select throws_ok(
  $$ update public.months set status = 'closed' $$,
  '42501', null, 'month status is not writable by clients');

insert into public.contacts (name) values ('P''Ball');
select throws_ok(
  $$ update public.contacts set linked_user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'linked_user_id cannot be set directly');
select throws_ok(
  $$ select public.link_contact((select id from public.contacts), 'FRONG234') $$,
  '22023', 'cannot_link_self', 'cannot link a contact to yourself');
select throws_ok(
  $$ select public.link_contact((select id from public.contacts), 'NOPE2345') $$,
  'P0002', 'friend_code_not_found', 'unknown friend code is rejected');
select is((select (public.link_contact((select id from public.contacts), 'ball2345')).linked_user_id),
          '22222222-2222-2222-2222-222222222222'::uuid, 'link_contact links by friend code (case-insensitive)');
select is((select count(*) from public.public_profiles), 2::bigint,
          'Frong sees Ball''s public profile after linking');

-- As Ball ----------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select count(*) from public.months), 0::bigint, 'Ball cannot see Frong''s months');
select is((select count(*) from public.profiles), 1::bigint, 'Ball only reads his own profile row');
select is((select count(*) from public.public_profiles), 2::bigint,
          'Ball sees Frong''s public profile because Frong linked him');
select throws_ok(
  $$ insert into public.items (month_id, kind, name, amount)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'income', 'Sneaky', 100) $$,
  '42501', null, 'Ball cannot add items to Frong''s month');

-- Closed month -----------------------------------------------------------------

reset role;
update public.months set status = 'closed' where month = 10;

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok($$ update public.items set amount = 1 where name = 'KTC' $$,
                 'P0001', 'month_closed', 'amounts are locked in a closed month');
select lives_ok($$ update public.items set status = 'done', done_at = now() where name = 'KTC' $$,
                'items can still be marked done in a closed month');
select throws_ok($$ insert into public.sub_items (item_id, name, amount)
                    select id, 'Late', 1 from public.items where name = 'KTC' $$,
                 'P0001', 'month_closed', 'sub-items are locked in a closed month');

delete from public.months where month = 10;
select is((select count(*) from public.months where month = 10), 1::bigint,
          'a closed month cannot be deleted');

select * from finish();
rollback;
