-- BratClient — migracja 002: buildy (historia), 2FA e-mail, refresh tokeny, logi admina
-- Uruchom w Supabase Dashboard -> SQL Editor -> New query -> Run

-- ---------- 1. Buildy: historia plikow .exe ----------
drop table if exists builds;

create table builds (
  id          uuid primary key default gen_random_uuid(),
  version     text not null,
  filename    text not null,
  size        bigint not null default 0,
  path        text not null,
  notes       text,
  mandatory   boolean not null default true,
  blocked     boolean not null default false,
  is_active   boolean not null default false,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references users(id) on delete set null
);
create index if not exists builds_active_idx on builds (is_active desc, uploaded_at desc);

alter table builds enable row level security;

-- ---------- 2. Kody 2FA (e-mail) ----------
create table if not exists two_factor_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  code_hash  text not null,
  purpose    text not null default 'login',
  attempts   integer not null default 0,
  used       boolean not null default false,
  ip         text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists twofa_user_idx on two_factor_codes (user_id, created_at desc);
alter table two_factor_codes enable row level security;

-- ---------- 3. Refresh tokeny ----------
create table if not exists refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  ip         text,
  user_agent text,
  revoked    boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists refresh_user_idx on refresh_tokens (user_id);
alter table refresh_tokens enable row level security;

-- ---------- 4. Logi akcji admina ----------
create table if not exists admin_logs (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references users(id) on delete set null,
  admin_username text,
  action         text not null,
  target         text,
  details        jsonb,
  ip             text,
  ts             timestamptz not null default now()
);
create index if not exists admin_logs_ts_idx on admin_logs (ts desc);
alter table admin_logs enable row level security;

-- ---------- 5. Uzytkownicy: pola bezpieczenstwa ----------
alter table users add column if not exists twofa_method text not null default 'email';
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists last_login_ip text;
alter table users add column if not exists password_changed_at timestamptz;

-- ---------- 6. Rate limit ogolny (nie tylko client API) ----------
create table if not exists rate_events (
  id     uuid primary key default gen_random_uuid(),
  bucket text not null,
  ip     text not null,
  ts     timestamptz not null default now()
);
create index if not exists rate_events_lookup_idx on rate_events (bucket, ip, ts desc);
alter table rate_events enable row level security;
