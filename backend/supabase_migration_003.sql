-- BratClient — migracja 003: configi modułów (chmura configów)
-- Uruchom w Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists configs (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                  -- publiczne ID, np. DFVMG
  user_id       uuid references users(id) on delete set null,
  author        text,                                  -- nazwa autora (snapshot)
  name          text not null,
  description   text,
  settings      jsonb not null,                        -- pelny dump ustawien modulow
  modules_count integer not null default 0,
  client_version text,
  is_public     boolean not null default true,
  downloads     integer not null default 0,
  size_bytes    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists configs_user_idx on configs (user_id, updated_at desc);
create index if not exists configs_code_idx on configs (code);
alter table configs enable row level security;
