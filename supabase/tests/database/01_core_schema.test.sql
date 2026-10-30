begin;
select plan(28);

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

-- Linking with a code per contact: Frong gets P'Ball's invite code and sends it to Ball.
create temp table invite as select public.contact_invite_code((select id from public.contacts)) as code;
select matches((select code from invite), '^[A-HJ-NP-Z2-9]{8}$', 'invite code uses the look-alike-free alphabet');
select is(public.contact_invite_code((select id from public.contacts)), (select code from invite),
          'the same contact keeps the same code');
select throws_ok($$ select public.accept_contact_invite((select code from invite)) $$,
                 '22023', 'cannot_link_self', 'cannot accept your own invite');

-- As Ball ----------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok($$ select public.accept_contact_invite('NOPE2345') $$,
                 'P0002', 'invite_not_found', 'unknown invite code is rejected');
select is((select inviter_name from public.peek_contact_invite((select code from invite))), 'Frong',
          'peeking shows who the invite comes from');
select results_eq(
  $$ select name, linked_user_id from public.accept_contact_invite((select lower(code) from invite)) $$,
  $$ values ('Frong', '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'accepting (case-insensitive) creates a linked contact for the inviter on Ball''s side');
select throws_ok($$ select public.accept_contact_invite((select code from invite)) $$,
                 'P0002', 'invite_not_found', 'an invite code works only once');

select is((select count(*) from public.months), 0::bigint, 'Ball cannot see Frong''s months');
select is((select count(*) from public.profiles), 1::bigint, 'Ball only reads his own profile row');
select is((select count(*) from public.public_profiles), 2::bigint,
          'Ball sees Frong''s public profile once they are linked');
select throws_ok(
  $$ insert into public.items (month_id, kind, name, amount)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'income', 'Sneaky', 100) $$,
  '42501', null, 'Ball cannot add items to Frong''s month');

-- Back as Frong ---------------------------------------------------------------

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq($$ select linked_user_id, invite_code from public.contacts $$,
                  $$ values ('22222222-2222-2222-2222-222222222222'::uuid, null::text) $$,
                  'Frong''s contact is linked to Ball and the code is used up');
select throws_ok($$ select public.contact_invite_code((select id from public.contacts)) $$,
                 '22023', 'contact_already_linked', 'a linked contact has no invite code');
select is((select (public.unlink_contact((select id from public.contacts))).linked_user_id), null::uuid,
          'unlink_contact removes the link');

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
