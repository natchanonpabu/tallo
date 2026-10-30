begin;
select plan(23);

-- Fixtures (as postgres) --------------------------------------------------------
-- Frong sends view-only statements to Ball (who owes Frong) and Chompoo (whom Frong owes).

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local',   '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',    '{"display_name": "Ball"}'),
  ('33333333-3333-3333-3333-333333333333', 'chompoo@test.local', '{"display_name": "Chompoo"}');

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10);

insert into public.contacts (id, owner_id, name, linked_user_id) values
  ('c0000000-0000-0000-0000-00000000ba11', '11111111-1111-1111-1111-111111111111', 'P''Ball', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-0000000c4090', '11111111-1111-1111-1111-111111111111', 'Chompoo', '33333333-3333-3333-3333-333333333333'),
  ('c0000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 'No account', null);

insert into public.items (id, owner_id, month_id, kind, category, name, amount, position) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', 'spending', 'KTC', 1237400, 1),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', 'spending', 'Food', 177100, 2);

insert into public.sub_items (id, owner_id, item_id, name, amount) values
  ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', 'P''Ball part', 805000);

-- As Frong ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select public.set_split('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-00000000ba11"}]', false);
select public.set_split('10000000-0000-0000-0000-000000000002', null, 'equal',
                        '[{"contact_id": "c0000000-0000-0000-0000-0000000c4090"}]');
insert into public.offsets (month_id, contact_id, name, amount) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 'Dad Insurance', 385100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090', 'Chompoo bill', 2693900);

select throws_ok(
  $$ select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000000aa') $$,
  '22023', 'contact_not_linked', 'cannot send to a contact without an account');

-- Ball owes Frong: 805,000 − 385,100 = 419,900.
select results_eq(
  $$ select status::text, version, total
     from public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 'October') $$,
  $$ values ('sent', 1, 419900::bigint) $$,
  'send to someone who owes me');
select results_eq(
  $$ select l.kind, l.group_label, l.label, l.amount from public.request_lines l
     join public.payment_requests r on r.id = l.request_id
     where r.sender_contact_id = 'c0000000-0000-0000-0000-00000000ba11' order by l.position $$,
  $$ values ('share', 'KTC', 'P''Ball part', 805000::bigint),
            ('offset', null, 'Dad Insurance', -385100::bigint) $$,
  'lines snapshot the shares and offsets');

-- Frong owes Chompoo: 88,550 − 2,693,900 = −2,605,350. Sending is allowed now.
select results_eq(
  $$ select status::text, total
     from public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090') $$,
  $$ values ('sent', -2605350::bigint) $$,
  'send to someone I owe (negative total)');

-- A person whose balance is zero has nothing to send.
insert into public.offsets (month_id, contact_id, name, amount) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 'Even out', 419900);
select throws_ok(
  $$ select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11') $$,
  '22023', 'net_is_zero', 'nothing to send when the balance is zero');
delete from public.offsets where name = 'Even out';

-- The old accept / pay / confirm steps are gone.
select hasnt_function('public', 'accept_request', 'accept_request was removed');
select hasnt_function('public', 'mark_request_paid', 'mark_request_paid was removed');
select hasnt_function('public', 'confirm_request_received', 'confirm_request_received was removed');

-- As Ball ----------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select type from public.notifications), 'request_received', 'Ball is notified');
select is((select count(*) from public.payment_requests), 1::bigint, 'Ball sees only the request sent to him');
select is((select count(*) from public.request_lines), 2::bigint, 'Ball sees its lines');
select is((select count(*) from public.items), 0::bigint, 'Ball still cannot see Frong''s items');
select is((select count(*) from public.months), 0::bigint, 'viewing a request adds nothing to Ball''s months');
select is((select count(*) from public.public_profiles where display_name = 'Frong'), 1::bigint,
          'Ball can see the sender''s name');
select throws_ok($$ update public.payment_requests set status = 'cancelled' $$, '42501', null,
                 'requests cannot be updated directly');
select throws_ok($$ select public.cancel_request(id) from public.payment_requests $$,
                 'P0002', 'request_not_found', 'only the sender can cancel');

select lives_ok(
  $$ select public.comment_request(r.id, 'What is this?', l.id, true)
     from public.payment_requests r join public.request_lines l on l.request_id = r.id and l.kind = 'offset' $$,
  'Ball asks about a line');
select is((select status::text from public.payment_requests), 'questioned', 'a question marks the request questioned');

-- As Frong: change the amount and resend ---------------------------------------

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is((select type from public.notifications order by created_at desc limit 1),
          'request_questioned', 'Frong is notified about the question');
update public.sub_items set amount = 800000 where id = '50000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select status::text, version, total
     from public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11') $$,
  $$ values ('sent', 2, 414900::bigint) $$,
  'resending bumps the version and total and clears the question');

select is((select (public.cancel_request(id)).status::text from public.payment_requests
           where sender_contact_id = 'c0000000-0000-0000-0000-0000000c4090'), 'cancelled', 'Frong cancels Chompoo''s');

-- As Chompoo -------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is((select type from public.notifications order by created_at desc limit 1), 'request_cancelled',
          'Chompoo is notified about the cancellation');

-- Notification preferences -----------------------------------------------------

reset role;
update public.profiles set notify_prefs = '{"request_received": false}' where id = '33333333-3333-3333-3333-333333333333';
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090');
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is((select count(*) from public.notifications where type = 'request_received'), 1::bigint,
          'a turned-off notification type is not sent again');

select * from finish();
rollback;
