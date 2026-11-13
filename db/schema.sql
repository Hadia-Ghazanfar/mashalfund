-- Mash'al Fund Manager — Postgres schema (Supabase compatible)
-- Run this once in the Supabase SQL editor (or psql) for a fresh project.
-- No data in here is secret; there are NO credentials in this file.

create extension if not exists "pgcrypto";

-- Members. status: 'pending' (signed up, not yet approved), 'active', 'inactive'.
-- password_hash is a PBKDF2-HMAC-SHA256 (210k iterations) hex digest; password_salt is hex.
-- legacy_pin_hash is a PBKDF2 hex digest of an old 4-digit PIN, only used for the
-- one-time migration: an account with no password_hash can sign in once with the
-- old PIN / a temporary password and is then forced to set a real password.
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'member' check (role in ('admin','treasurer','member')),
  status text not null default 'pending' check (status in ('pending','active','inactive')),
  password_hash text,
  password_salt text,
  legacy_pin_hash text,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

-- Sessions. Only the SHA-256 hash of the token is stored; the token itself is
-- never stored. Sessions last 30 days.
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_token_hash_idx on sessions(token_hash);
create index if not exists sessions_member_idx on sessions(member_id);

-- Every sign-in attempt, success or failure, for the admin security log.
create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete set null,
  success boolean not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_member_idx on login_attempts(member_id, created_at desc);

-- Key/value org settings (e.g. org_name = 'Mash''al Initiative').
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Fund entries. kind: 'donation' (money in) or 'expense' (money out).
-- project_id links an expense to a drive; category is free text
-- ('Transport', 'Food', 'Drive', ...).
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('donation','expense')),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  category text not null default 'General',
  project_id uuid references projects(id) on delete set null,
  member_id uuid references members(id) on delete set null,
  member_name text not null default '',
  tx_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists transactions_date_idx on transactions(tx_date desc);

-- Drives / projects. kind: 'priced' (item-wise costing, auto-deducted) or
-- 'in-kind' (quantity-based, e.g. clothes drive — no price at all).
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'priced' check (kind in ('priced','in-kind')),
  status text not null default 'open' check (status in ('open','completed')),
  description text not null default '',
  created_at timestamptz not null default now()
);

-- Costed line items of a priced drive. total = qty * unit_price (stored).
-- Adding an item auto-deducts its total from the funds (see app logic).
create table if not exists project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_items_project_idx on project_items(project_id);

-- In-kind hand-outs (e.g. clothes given out). Quantity-based, no price.
create table if not exists distributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  item_type text not null,
  condition text not null default '',
  qty integer not null default 1,
  donor text not null default '',
  recipient text not null default '',
  proof text not null default '',
  member_id uuid references members(id) on delete set null,
  member_name text not null default '',
  dist_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists distributions_project_idx on distributions(project_id);

-- Audit trail: who added / edited / deleted what, with old -> new values.
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete set null,
  member_name text not null default '',
  action text not null,
  detail text not null default '',
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_created_idx on activity_log(created_at desc);

-- Per-member notifications (e.g. a teammate edited the funds, a sign-up awaits approval).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_member_idx on notifications(member_id, created_at desc);
