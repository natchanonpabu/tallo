-- +goose Up
-- +goose StatementBegin
create type expense_status as enum ('pending', 'paid');
create type income_status  as enum ('pending', 'received');
create type person_status  as enum ('pending', 'settled');

-- optional in v1; wire real auth in phase 2
create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

create table months (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now()
);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references months(id) on delete cascade,
  grp        text   not null default '',
  name       text   not null default '',
  amount     bigint not null default 0,   -- satang, reference only
  minimum    bigint not null default 0,   -- satang, reference only
  custom     bigint not null default 0,   -- satang, THE figure used in totals
  status     expense_status not null default 'pending',
  position   int    not null default 0,
  created_at timestamptz not null default now()
);

create table incomes (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references months(id) on delete cascade,
  name       text   not null default '',
  amount     bigint not null default 0,   -- satang
  status     income_status not null default 'pending',
  position   int    not null default 0,
  created_at timestamptz not null default now()
);

create table people (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references months(id) on delete cascade,
  name       text   not null default '',
  status     person_status not null default 'pending',
  position   int    not null default 0,
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references people(id) on delete cascade,
  label             text   not null default '',
  amount            bigint not null,            -- signed satang: + owner paid, - they paid
  source_expense_id uuid references expenses(id) on delete set null,  -- traceability only
  created_at        timestamptz not null default now()
);

create index on months(user_id, created_at);
create index on expenses(month_id);
create index on incomes(month_id);
create index on people(month_id);
create index on ledger_entries(person_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
drop table if exists ledger_entries;
drop table if exists people;
drop table if exists incomes;
drop table if exists expenses;
drop table if exists months;
drop table if exists users;
drop type if exists person_status;
drop type if exists income_status;
drop type if exists expense_status;
-- +goose StatementEnd
