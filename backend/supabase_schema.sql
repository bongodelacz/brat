-- BratClient — schemat bazy (Supabase / Postgres)
-- Uruchom w Supabase Dashboard -> SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  password_hash     text not null,
  username          text not null,
  uid               text not null unique,
  about             text default '',
  avatar            text,
  language          text not null default 'pl',
  discord_connected boolean not null default false,
  twofa_enabled     boolean not null default false,
  blocked           boolean not null default false,
  tester            boolean not null default false,
  hwid              text,
  hwid_bound        boolean not null default false,
  hwid_bound_at     timestamptz,
  hwid_credits      integer not null default 0,
  hwid_last_reset   timestamptz,
  role              text not null default 'user',
  created_at        timestamptz not null default now()
);
create index if not exists users_username_idx on users (username);
create index if not exists users_created_idx on users (created_at desc);

create table if not exists licenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  plan       text not null,
  days       integer,
  key        text not null unique,
  price_pln  numeric(10,2) not null default 0,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists licenses_user_idx on licenses (user_id);
create index if not exists licenses_status_idx on licenses (status);

create table if not exists orders (
  id         uuid primary key default gen_random_uuid(),
  order_id   text not null unique,
  user_id    uuid references users(id) on delete cascade,
  email      text not null,
  username   text,
  method     text not null default 'DEMO',
  item_type  text not null,
  item_id    text not null,
  item       text not null,
  subtotal   numeric(10,2) not null default 0,
  discount   numeric(10,2) not null default 0,
  total      numeric(10,2) not null default 0,
  currency   text not null default 'PLN',
  coupon     text,
  status     text not null default 'completed',
  ref_id     text,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on orders (user_id);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

create table if not exists coupons (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  type       text not null,
  value      numeric(10,2) not null,
  max_uses   integer not null default 0,
  uses       integer not null default 0,
  expires_at timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists addons (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  addon      text not null,
  price_pln  numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id   uuid primary key default gen_random_uuid(),
  ip   text,
  path text,
  ts   timestamptz not null default now()
);
create index if not exists visits_ts_idx on visits (ts desc);

create table if not exists builds (
  id                 text primary key,
  version            text not null default '1.0.0',
  mandatory          boolean not null default true,
  notes              text,
  filename           text,
  size               bigint,
  path               text,
  uploaded_at        timestamptz,
  version_updated_at timestamptz
);

create table if not exists client_logs (
  id         uuid primary key default gen_random_uuid(),
  ip         text,
  result     text not null,
  hwid       text,
  identifier text,
  version    text,
  user_id    uuid,
  ts         timestamptz not null default now()
);
create index if not exists client_logs_ts_idx on client_logs (ts desc);

create table if not exists client_sessions (
  token      text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  hwid       text not null,
  ip         text,
  version    text,
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);
create index if not exists client_sessions_user_idx on client_sessions (user_id);

create table if not exists client_nonces (
  nonce text primary key,
  ts    timestamptz not null default now()
);

create table if not exists client_rate (
  id     uuid primary key default gen_random_uuid(),
  bucket text not null,
  ip     text not null,
  ts     timestamptz not null default now()
);
create index if not exists client_rate_lookup_idx on client_rate (bucket, ip, ts desc);

create table if not exists login_attempts (
  key          text primary key,
  count        integer not null default 0,
  locked_until timestamptz
);

-- RLS: dostep tylko z backendu (service_role), wiec wlaczamy RLS bez polityk.
-- service_role omija RLS, anon/public nie ma dostepu do zadnych danych.
alter table users            enable row level security;
alter table licenses         enable row level security;
alter table orders           enable row level security;
alter table coupons          enable row level security;
alter table addons           enable row level security;
alter table visits           enable row level security;
alter table builds           enable row level security;
alter table client_logs      enable row level security;
alter table client_sessions  enable row level security;
alter table client_nonces    enable row level security;
alter table client_rate      enable row level security;
alter table login_attempts   enable row level security;

-- Bucket na plik .exe (prywatny — pobieranie tylko przez backend po sprawdzeniu licencji)
insert into storage.buckets (id, name, public, file_size_limit)
values ('builds', 'builds', false, 209715200)
on conflict (id) do update set file_size_limit = 209715200, public = false;
