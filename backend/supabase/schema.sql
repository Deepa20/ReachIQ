-- ReachIQ starter Supabase schema.
-- Run this in the Supabase SQL editor before using the persistence endpoints.

create extension if not exists pgcrypto;

create table if not exists public.validation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  source_name text not null default 'manual-upload',
  summary jsonb not null default '{}'::jsonb,
  list_health_score integer not null default 0,
  uploaded_contacts integer not null default 0,
  deliverable_contacts integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid null references public.validation_runs(id) on delete set null,
  owner_id uuid null,
  name text null,
  email text not null,
  company text null,
  title text null,
  validation_status text null,
  temperature text null,
  score integer not null default 0,
  icp_fit_score integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contacts_owner_email_idx
  on public.contacts(owner_id, lower(email))
  where owner_id is not null;

create table if not exists public.target_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  company text not null,
  industry text null,
  priority boolean not null default false,
  engagement_score integer not null default 0,
  stage text not null default 'Monitoring',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signal_events (
  id uuid primary key default gen_random_uuid(),
  target_account_id uuid null references public.target_accounts(id) on delete cascade,
  owner_id uuid null,
  signal_type text not null,
  strength integer not null default 0,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.white_label_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  agency_name text not null,
  product_name text not null,
  primary_colour text not null default '#2454ff',
  logo_url text null,
  custom_domain text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  actor text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.validation_runs enable row level security;
alter table public.contacts enable row level security;
alter table public.target_accounts enable row level security;
alter table public.signal_events enable row level security;
alter table public.white_label_settings enable row level security;
alter table public.audit_logs enable row level security;

-- The backend should use SUPABASE_SERVICE_ROLE_KEY for server-side writes.
-- Add user-facing RLS policies before exposing these tables directly to browsers.
