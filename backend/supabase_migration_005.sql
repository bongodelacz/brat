-- BratClient — migracja 005: log wydanych kluczy (unlock) — BYŻ kluczów (nie trzymamy sekretów)
-- Uruchom w Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists unlock_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete set null,
  username     text,
  uid          text,
  license_key  text,
  plan         text,
  hwid         text,
  ip           text,
  version      text,
  first_bound  boolean not null default false,
  ts           timestamptz not null default now()
);
create index if not exists unlock_logs_ts_idx on unlock_logs (ts desc);
create index if not exists unlock_logs_user_idx on unlock_logs (user_id);
alter table unlock_logs enable row level security;