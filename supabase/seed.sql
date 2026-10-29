-- Local development data: October 2026 from the "Expenses tracking" sheet (ชีต1).
-- Runs on `supabase db reset`. Every user's password is "password123".
--
--   frong@tallo.local    owner of the sheet
--   ball@tallo.local     P'Ball — pays Frong back for his part of Frong's cards and loans
--   chompoo@tallo.local  Chompoo
--
-- The "Chompoo / 2" items (Food 1,771 / 7 Eleven 1,358 / Fortuner 2,974 / Dumbell 447) are card
-- sub-items split 50/50 with Chompoo. The sheet does not say which card paid for each, so they are
-- placed on cards with enough room left; move them if that is wrong. October's balance is −4,686.48,
-- matching the sheet (business.md §13.1).

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('password123', extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}', jsonb_build_object('display_name', u.name),
       now(), now(), '', '', '', ''
from (values
  ('5eed0000-0000-0000-0000-000000000001'::uuid, 'frong@tallo.local',   'Frong'),
  ('5eed0000-0000-0000-0000-000000000002'::uuid, 'ball@tallo.local',    'P''Ball'),
  ('5eed0000-0000-0000-0000-000000000003'::uuid, 'chompoo@tallo.local', 'Chompoo')
) as u (id, email, name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users
where email like '%@tallo.local';

update public.profiles set color = '#B8A9F0' where id = '5eed0000-0000-0000-0000-000000000001';
update public.profiles set color = '#A7D8F0' where id = '5eed0000-0000-0000-0000-000000000002';
update public.profiles set color = '#F7C6D9' where id = '5eed0000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Frong: contacts, cards and loans
-- ---------------------------------------------------------------------------

insert into public.contacts (id, owner_id, name, color, linked_user_id) values
  ('c1000000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0000-000000000001', 'P''Ball',  '#A7D8F0', '5eed0000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0000-000000000001', 'Chompoo', '#F7C6D9', '5eed0000-0000-0000-0000-000000000003'),
  ('c1000000-0000-0000-0000-000000000003', '5eed0000-0000-0000-0000-000000000001', 'P''Nok',   '#FFE29A', null);

insert into public.debt_accounts (id, owner_id, kind, name, installment_amount) values
  ('d1000000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0000-000000000001', 'card', 'KBank',               null),
  ('d1000000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0000-000000000001', 'card', 'KTC',                 null),
  ('d1000000-0000-0000-0000-000000000003', '5eed0000-0000-0000-0000-000000000001', 'card', 'TTB',                 null),
  ('d1000000-0000-0000-0000-000000000004', '5eed0000-0000-0000-0000-000000000001', 'card', 'GSB',                 null),
  ('d1000000-0000-0000-0000-000000000005', '5eed0000-0000-0000-0000-000000000001', 'card', 'Aeon',                null),
  ('d1000000-0000-0000-0000-000000000006', '5eed0000-0000-0000-0000-000000000001', 'card', 'LineBK',              null),
  ('d1000000-0000-0000-0000-000000000007', '5eed0000-0000-0000-0000-000000000001', 'card', 'True pay next extra', null),
  ('d1000000-0000-0000-0000-000000000008', '5eed0000-0000-0000-0000-000000000001', 'card', 'True pay next',       null),
  ('d1000000-0000-0000-0000-000000000011', '5eed0000-0000-0000-0000-000000000001', 'loan', 'KBank loan',          501000),
  ('d1000000-0000-0000-0000-000000000012', '5eed0000-0000-0000-0000-000000000001', 'loan', 'KTC pround',          306200),
  ('d1000000-0000-0000-0000-000000000013', '5eed0000-0000-0000-0000-000000000001', 'loan', 'Krungthai loan',      270000);

-- ---------------------------------------------------------------------------
-- Frong: October 2026
-- ---------------------------------------------------------------------------

insert into public.months (id, owner_id, year, month, status) values
  ('a1000000-0000-0000-0000-000000202610', '5eed0000-0000-0000-0000-000000000001', 2026, 10, 'active');

insert into public.items (id, owner_id, month_id, kind, debt_account_id, category, recurring, name, amount, position)
select i.id, '5eed0000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000202610',
       i.kind::public.item_kind, i.account, i.category::public.expense_cat, i.recurring, i.name, i.amount, i.position
from (values
  -- Cards ("Frong card" column, amounts in satang)
  ('e1000000-0000-0000-0000-000000000001'::uuid, 'card', 'd1000000-0000-0000-0000-000000000001'::uuid, null, false, 'KBank',               198900::bigint,  1),
  ('e1000000-0000-0000-0000-000000000002'::uuid, 'card', 'd1000000-0000-0000-0000-000000000002'::uuid, null, false, 'KTC',                 1237400::bigint, 2),
  ('e1000000-0000-0000-0000-000000000003'::uuid, 'card', 'd1000000-0000-0000-0000-000000000003'::uuid, null, false, 'TTB',                 337200::bigint,  3),
  ('e1000000-0000-0000-0000-000000000004'::uuid, 'card', 'd1000000-0000-0000-0000-000000000004'::uuid, null, false, 'GSB',                 250000::bigint,  4),
  ('e1000000-0000-0000-0000-000000000005'::uuid, 'card', 'd1000000-0000-0000-0000-000000000005'::uuid, null, false, 'Aeon',                189100::bigint,  5),
  ('e1000000-0000-0000-0000-000000000006'::uuid, 'card', 'd1000000-0000-0000-0000-000000000006'::uuid, null, false, 'LineBK',              27300::bigint,   6),
  ('e1000000-0000-0000-0000-000000000007'::uuid, 'card', 'd1000000-0000-0000-0000-000000000007'::uuid, null, false, 'True pay next extra', 514000::bigint,  7),
  ('e1000000-0000-0000-0000-000000000008'::uuid, 'card', 'd1000000-0000-0000-0000-000000000008'::uuid, null, false, 'True pay next',       174400::bigint,  8),
  -- Loans
  ('e1000000-0000-0000-0000-000000000011'::uuid, 'loan', 'd1000000-0000-0000-0000-000000000011'::uuid, null, false, 'KBank loan',          501000::bigint,  11),
  ('e1000000-0000-0000-0000-000000000012'::uuid, 'loan', 'd1000000-0000-0000-0000-000000000012'::uuid, null, false, 'KTC pround',          306200::bigint,  12),
  ('e1000000-0000-0000-0000-000000000013'::uuid, 'loan', 'd1000000-0000-0000-0000-000000000013'::uuid, null, false, 'Krungthai loan',      270000::bigint,  13),
  -- "Frong other" column
  ('e1000000-0000-0000-0000-000000000021'::uuid, 'expense', null, 'spending',     false, 'Shopee',            328800::bigint,  21),
  ('e1000000-0000-0000-0000-000000000022'::uuid, 'expense', null, 'subscription', true,  'Internet (Mobile)', 130500::bigint,  22),
  ('e1000000-0000-0000-0000-000000000023'::uuid, 'expense', null, 'subscription', true,  'SSO',               43200::bigint,   23),
  ('e1000000-0000-0000-0000-000000000024'::uuid, 'expense', null, 'pay_person',   false, 'Chompoo',           2693848::bigint, 24),
  ('e1000000-0000-0000-0000-000000000025'::uuid, 'expense', null, 'savings',      true,  'Wed kept',          500000::bigint,  25),
  ('e1000000-0000-0000-0000-000000000026'::uuid, 'expense', null, 'spending',     false, 'Food',              300000::bigint,  26),
  ('e1000000-0000-0000-0000-000000000027'::uuid, 'expense', null, 'savings',      true,  'Kept',              0::bigint,       27),
  ('e1000000-0000-0000-0000-000000000028'::uuid, 'expense', null, 'savings',      true,  'Invest',            0::bigint,       28),
  ('e1000000-0000-0000-0000-000000000029'::uuid, 'expense', null, 'savings',      true,  'Dad kept',          0::bigint,       29),
  ('e1000000-0000-0000-0000-000000000030'::uuid, 'expense', null, 'spending',     false, '60/40',             66700::bigint,   30),
  ('e1000000-0000-0000-0000-000000000031'::uuid, 'expense', null, 'subscription', true,  'Youtube',           19800::bigint,   31),
  -- Income
  ('e1000000-0000-0000-0000-000000000041'::uuid, 'income',  null, null,           true,  'Salary',            5335000::bigint, 41)
) as i (id, kind, account, category, recurring, name, amount, position);

-- P'Ball's part of the KTC and TTB bills, and the "Chompoo / 2" column spread over the cards.
insert into public.sub_items (id, owner_id, item_id, name, amount, position) values
  ('f1000000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'P''Ball',   805000, 1),
  ('f1000000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'P''Ball',   222100, 1),
  ('f1000000-0000-0000-0000-000000000011', '5eed0000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Food',     177100, 1),
  ('f1000000-0000-0000-0000-000000000012', '5eed0000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000005', '7 Eleven', 135800, 1),
  ('f1000000-0000-0000-0000-000000000013', '5eed0000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'Fortuner', 297400, 2),
  ('f1000000-0000-0000-0000-000000000014', '5eed0000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'Dumbell',  44700,  2);

-- Splits go through the RPCs, acting as Frong.
select set_config('request.jwt.claims', '{"sub": "5eed0000-0000-0000-0000-000000000001", "role": "authenticated"}', false);

-- P'Ball's column: 8,050 + 2,221 (sub-items) + whole loans/cards + Youtube 132 = 28,332.
select public.set_split('e1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'equal',
                        '[{"contact_id": "c1000000-0000-0000-0000-000000000001"}]', false);
select public.set_split('e1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000002', 'equal',
                        '[{"contact_id": "c1000000-0000-0000-0000-000000000001"}]', false);
select public.apply_split(
  '[{"item_id": "e1000000-0000-0000-0000-000000000006"},
    {"item_id": "e1000000-0000-0000-0000-000000000007"},
    {"item_id": "e1000000-0000-0000-0000-000000000008"},
    {"item_id": "e1000000-0000-0000-0000-000000000011"},
    {"item_id": "e1000000-0000-0000-0000-000000000012"},
    {"item_id": "e1000000-0000-0000-0000-000000000013"}]',
  'equal', '[{"contact_id": "c1000000-0000-0000-0000-000000000001"}]', false, null, true);
select public.set_split('e1000000-0000-0000-0000-000000000031', null, 'fixed',
                        '[{"contact_id": "c1000000-0000-0000-0000-000000000001", "amount": 13200}]',
                        true, null, true);

-- Chompoo / 2: 6,550 halved = 3,275.
select public.apply_split(
  '[{"item_id": "e1000000-0000-0000-0000-000000000001", "sub_item_id": "f1000000-0000-0000-0000-000000000011"},
    {"item_id": "e1000000-0000-0000-0000-000000000005", "sub_item_id": "f1000000-0000-0000-0000-000000000012"},
    {"item_id": "e1000000-0000-0000-0000-000000000002", "sub_item_id": "f1000000-0000-0000-0000-000000000013"},
    {"item_id": "e1000000-0000-0000-0000-000000000003", "sub_item_id": "f1000000-0000-0000-0000-000000000014"}]',
  'equal', '[{"contact_id": "c1000000-0000-0000-0000-000000000002"}]');

select set_config('request.jwt.claims', '', false);

-- P'Ball paid these for Frong, so they come off what he owes (8,760).
insert into public.offsets (owner_id, month_id, contact_id, name, amount, position) values
  ('5eed0000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000202610',
   'c1000000-0000-0000-0000-000000000001', 'Dad Insurance', 385100, 1),
  ('5eed0000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000202610',
   'c1000000-0000-0000-0000-000000000001', 'Fortuner', 490900, 2);
