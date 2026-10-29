begin;
select plan(36);

-- Fixtures (as postgres) --------------------------------------------------------
-- Frong sends; Ball and Chompoo receive. Nok is a contact without an account.

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'frong@test.local',   '{"display_name": "Frong"}'),
  ('22222222-2222-2222-2222-222222222222', 'ball@test.local',    '{"display_name": "Ball"}'),
  ('33333333-3333-3333-3333-333333333333', 'chompoo@test.local', '{"display_name": "Chompoo"}'),
  ('44444444-4444-4444-4444-444444444444', 'nok@test.local',     '{"display_name": "Nok"}');

insert into public.months (id, owner_id, year, month) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 2026, 10);

insert into public.contacts (id, owner_id, name, linked_user_id) values
  ('c0000000-0000-0000-0000-00000000ba11', '11111111-1111-1111-1111-111111111111', 'P''Ball', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-0000000c4090', '11111111-1111-1111-1111-111111111111', 'Chompoo', '33333333-3333-3333-3333-333333333333'),
  ('c0000000-0000-0000-0000-00000000040c', '11111111-1111-1111-1111-111111111111', 'P''Nok', '44444444-4444-4444-4444-444444444444'),
  ('c0000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 'No account', null);

insert into public.items (id, owner_id, month_id, kind, category, name, amount, position) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', 'spending', 'KTC', 1237400, 1),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'expense', 'spending', 'Food', 177100, 2),
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'income', null, 'Salary', 5335000, 3);

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
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000040c', 'Nok paid for me', 1000);

select throws_ok(
  $$ select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000000aa') $$,
  '22023', 'contact_not_linked', 'cannot send to a contact without an account');
select throws_ok(
  $$ select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000040c') $$,
  '22023', 'net_not_positive', 'cannot send when I am the one who owes');

-- Send to Ball: 805,000 − 385,100 = 419,900.
select results_eq(
  $$ select status::text, version, total
     from public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11', 'October') $$,
  $$ values ('sent', 1, 419900::bigint) $$,
  'send_request creates a sent request with the net total');
select results_eq(
  $$ select kind, group_label, label, amount from public.request_lines order by position $$,
  $$ values ('share', 'KTC', 'P''Ball part', 805000::bigint),
            ('offset', null, 'Dad Insurance', -385100::bigint) $$,
  'request lines snapshot the shares and offsets');
select is((select message from public.request_events where type = 'sent'), 'October', 'the note is kept as the sent event');

-- As Ball ----------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select type from public.notifications), 'request_received', 'Ball is notified');
select is((select count(*) from public.payment_requests), 1::bigint, 'Ball sees the request');
select is((select count(*) from public.request_lines), 2::bigint, 'Ball sees its lines');
select is((select count(*) from public.items), 0::bigint, 'Ball still cannot see Frong''s items');
select is((select count(*) from public.public_profiles where display_name = 'Frong'), 1::bigint,
          'Ball can see the sender''s name');
select throws_ok($$ update public.payment_requests set status = 'received' $$, '42501', null,
                 'requests cannot be updated directly');
select throws_ok($$ select public.confirm_request_received(id) from public.payment_requests $$,
                 'P0002', 'request_not_found', 'only the sender can confirm receipt');
select throws_ok($$ select public.mark_request_paid(id) from public.payment_requests $$,
                 '22023', 'request_wrong_status', 'a request must be accepted before it is paid');

select lives_ok(
  $$ select public.comment_request(r.id, 'What is this?', l.id, true)
     from public.payment_requests r join public.request_lines l on l.request_id = r.id and l.kind = 'offset' $$,
  'Ball asks about a line');
select is((select status::text from public.payment_requests), 'questioned', 'a question marks the request questioned');

-- As Frong: change the amount and resend ---------------------------------------

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is((select type from public.notifications where type like 'request_%' order by created_at desc limit 1),
          'request_questioned', 'Frong is notified about the question');
update public.sub_items set amount = 800000 where id = '50000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select status::text, version, total
     from public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11') $$,
  $$ values ('sent', 2, 414900::bigint) $$,
  'resending bumps the version and total');
select is((select count(*) from public.request_lines where version = 2), 2::bigint, 'new version has its own lines');

-- As Ball: accept and pay ------------------------------------------------------

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select type from public.notifications order by created_at desc limit 1), 'request_updated',
          'Ball is notified about the update');
select is((select (public.accept_request(id)).status::text from public.payment_requests), 'accepted', 'Ball accepts');
select results_eq(
  $$ select m.year, m.month, m.status::text from public.months m $$,
  $$ values (2026::smallint, 10::smallint, 'draft') $$,
  'accepting creates the same month for Ball');
select results_eq(
  $$ select i.kind::text, i.category::text, i.name, i.amount, i.source_request_id is not null from public.items i $$,
  $$ values ('expense', 'pay_person', 'Frong', 414900::bigint, true) $$,
  'accepting adds a pay-person expense to Ball''s month');
select is((select linked_user_id from public.contacts), '11111111-1111-1111-1111-111111111111'::uuid,
          'accepting creates a linked contact for the sender');

select is((select (public.mark_request_paid(id)).status::text from public.payment_requests), 'paid', 'Ball pays');
select results_eq($$ select status::text, paid_amount from public.items $$,
                  $$ values ('done', 414900::bigint) $$, 'paying marks Ball''s expense done');

-- As Frong: confirm ------------------------------------------------------------

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$ select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000ba11') $$,
  '22023', 'request_already_paid', 'a paid request cannot be resent');
select is((select (public.confirm_request_received(id)).status::text from public.payment_requests
           where sender_contact_id = 'c0000000-0000-0000-0000-00000000ba11'), 'received', 'Frong confirms receipt');
select is((select balance_actual from public.month_summaries), 414900::bigint,
          'received money counts in the actual balance');
select is((select count(*) from public.month_open_requests('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 0::bigint,
          'no open requests left');
select is((select count(*) from public.items where owner_id = '22222222-2222-2222-2222-222222222222'), 0::bigint,
          'Frong cannot see Ball''s items');

-- Cancel: send to Chompoo, Chompoo accepts, Frong cancels ----------------------

select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090');
select is((select count(*) from public.month_open_requests('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 1::bigint,
          'an unsettled request is listed as open');

set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select public.accept_request(id) from public.payment_requests;
select is((select amount from public.items), 88550::bigint, 'Chompoo has half of Food as an expense');

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is((select (public.cancel_request(id)).status::text from public.payment_requests
           where sender_contact_id = 'c0000000-0000-0000-0000-0000000c4090'), 'cancelled', 'Frong cancels');

set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is((select count(*) from public.items), 0::bigint, 'cancelling removes Chompoo''s expense');
select is((select type from public.notifications order by created_at desc limit 1), 'request_cancelled',
          'Chompoo is notified about the cancellation');

-- Notification preferences -----------------------------------------------------

update public.profiles set notify_prefs = '{"request_received": false}' where id = '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select public.send_request('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-0000000c4090');
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is((select count(*) from public.notifications where type = 'request_received'), 1::bigint,
          'a turned-off notification type is not sent again');

select * from finish();
rollback;
