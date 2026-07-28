-- Follow-Through Ledger — Supabase schema
-- Run this once in your Supabase project's SQL Editor.

create extension if not exists pgcrypto;

create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  text text not null,
  logged_by text not null,
  date_promised date not null,
  deadline date,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','waiting','done')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table commitments enable row level security;

-- This is an internal team tool with no login system, so we let the
-- public "anon" key read and write freely. The anon key is meant to be
-- exposed in frontend code — this policy is what actually controls
-- access. See README.md, step 7, if you want to lock this down further
-- (e.g. restrict to logged-in @yourcompany.com users).
create policy "anon full access" on commitments
  for all
  using (true)
  with check (true);

-- Automatically keep updated_at current whenever a row changes.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists commitments_set_updated_at on commitments;
create trigger commitments_set_updated_at
before update on commitments
for each row
execute function set_updated_at();

-- Helpful index for the common "open items, soonest deadline first" query
create index if not exists commitments_status_deadline_idx
  on commitments (status, deadline);
