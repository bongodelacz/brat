-- BratClient — migracja 004: integracja Discord (OAuth + role za licencje)
-- Uruchom w Supabase Dashboard -> SQL Editor -> New query -> Run

alter table users add column if not exists discord_id        text;
alter table users add column if not exists discord_username  text;
alter table users add column if not exists discord_linked_at timestamptz;
alter table users add column if not exists discord_role_active boolean not null default false;

-- Szybkie wyszukiwanie po discord_id + gwarancja, że jedno konto Discord = jedno konto BratClient
create unique index if not exists users_discord_id_key on users (discord_id) where discord_id is not null;
