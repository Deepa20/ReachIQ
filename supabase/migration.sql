-- ReachIQ Supabase baseline migration
-- Creates multi-tenant core tables with organization-scoped RLS and soft delete support.

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type app.campaign_status as enum ('draft', 'active', 'paused', 'completed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_module') then
    create type app.campaign_module as enum ('validate', 'signal', 'agency');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'upload_status') then
    create type app.upload_status as enum ('pending', 'processing', 'completed', 'failed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contact_status') then
    create type app.contact_status as enum ('new', 'validated', 'enriched', 'rejected');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_email_status') then
    create type app.ai_email_status as enum ('draft', 'queued', 'sent', 'failed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_classification') then
    create type app.lead_classification as enum ('HOT', 'WARM', 'COLD');
  end if;
end
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete set null,
  full_name text null,
  avatar_url text null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  domain citext null,
  industry text null,
  employee_count integer null check (employee_count >= 0),
  website text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (organization_id, domain)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id uuid null references public.companies(id) on delete set null,
  name text not null,
  domain citext not null,
  industry text not null,
  monitoring_enabled boolean not null default true,
  signal_score integer not null default 0 check (signal_score between 0 and 100),
  last_signal_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (organization_id, domain)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id uuid null references public.companies(id) on delete set null,
  first_name text null,
  last_name text null,
  email citext not null,
  title text null,
  linkedin_url text null,
  status app.contact_status not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (organization_id, email)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  module app.campaign_module not null,
  status app.campaign_status not null default 'draft',
  created_by uuid not null references auth.users(id) on delete restrict,
  config jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid null references public.accounts(id) on delete set null,
  company_id uuid null references public.companies(id) on delete set null,
  signal_type text not null check (signal_type in ('funding', 'job_posting', 'company_news', 'executive_change', 'technology_change')),
  strength integer not null check (strength between 1 and 5),
  signal_score integer not null default 0 check (signal_score between 0 and 100),
  summary text not null,
  source_url text null,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table public.signals
add column if not exists account_id uuid null references public.accounts(id) on delete set null;

alter table public.signals
add column if not exists signal_score integer not null default 0 check (signal_score between 0 and 100);

create table if not exists public.signal_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete cascade,
  signal_id uuid null references public.signals(id) on delete set null,
  event_type text not null check (event_type in ('account_started', 'signal_detected', 'score_updated', 'monitoring_paused', 'monitoring_resumed')),
  previous_score integer null check (previous_score between 0 and 100),
  new_score integer null check (new_score between 0 and 100),
  notes text null,
  payload jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.retry_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null check (job_type in ('hunter_validate_contact', 'apollo_enrich_contact', 'claude_generate_email')),
  payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  last_error text null,
  last_result jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null,
  file_path text not null,
  mime_type text null,
  row_count integer not null default 0 check (row_count >= 0),
  status app.upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.validation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  contact_id uuid null references public.contacts(id) on delete set null,
  validation_status text not null check (validation_status in ('valid', 'risky', 'invalid')),
  score integer not null default 0 check (score between 0 and 100),
  classification app.lead_classification not null default 'COLD',
  reasons jsonb not null default '[]'::jsonb,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table public.validation_results
add column if not exists classification app.lead_classification not null default 'COLD';

create table if not exists public.enrichment_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null,
  payload jsonb not null default '{}'::jsonb,
  enriched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (organization_id, contact_id, provider)
);

create table if not exists public.ai_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid null references public.campaigns(id) on delete set null,
  contact_id uuid null references public.contacts(id) on delete set null,
  subject text not null,
  body text not null,
  tone text null,
  language text null,
  model_name text null,
  status app.ai_email_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists idx_users_org on public.users (organization_id) where deleted_at is null;
create index if not exists idx_companies_org on public.companies (organization_id) where deleted_at is null;
create index if not exists idx_accounts_org on public.accounts (organization_id) where deleted_at is null;
create index if not exists idx_accounts_org_score on public.accounts (organization_id, signal_score desc) where deleted_at is null;
create index if not exists idx_contacts_org on public.contacts (organization_id) where deleted_at is null;
create index if not exists idx_campaigns_org on public.campaigns (organization_id) where deleted_at is null;
create index if not exists idx_signals_org on public.signals (organization_id) where deleted_at is null;
create index if not exists idx_signals_account on public.signals (account_id, detected_at desc) where deleted_at is null;
create index if not exists idx_signal_history_org on public.signal_history (organization_id, event_at desc) where deleted_at is null;
create index if not exists idx_retry_jobs_org on public.retry_jobs (organization_id, status, next_attempt_at) where deleted_at is null;
create index if not exists idx_uploads_org on public.uploads (organization_id) where deleted_at is null;
create index if not exists idx_validation_results_org on public.validation_results (organization_id) where deleted_at is null;
create index if not exists idx_enrichment_results_org on public.enrichment_results (organization_id) where deleted_at is null;
create index if not exists idx_ai_emails_org on public.ai_emails (organization_id) where deleted_at is null;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function app.set_updated_at();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function app.set_updated_at();

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function app.set_updated_at();

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function app.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function app.set_updated_at();

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function app.set_updated_at();

drop trigger if exists signals_set_updated_at on public.signals;
create trigger signals_set_updated_at
before update on public.signals
for each row execute function app.set_updated_at();

drop trigger if exists signal_history_set_updated_at on public.signal_history;
create trigger signal_history_set_updated_at
before update on public.signal_history
for each row execute function app.set_updated_at();

drop trigger if exists retry_jobs_set_updated_at on public.retry_jobs;
create trigger retry_jobs_set_updated_at
before update on public.retry_jobs
for each row execute function app.set_updated_at();

drop trigger if exists uploads_set_updated_at on public.uploads;
create trigger uploads_set_updated_at
before update on public.uploads
for each row execute function app.set_updated_at();

drop trigger if exists validation_results_set_updated_at on public.validation_results;
create trigger validation_results_set_updated_at
before update on public.validation_results
for each row execute function app.set_updated_at();

drop trigger if exists enrichment_results_set_updated_at on public.enrichment_results;
create trigger enrichment_results_set_updated_at
before update on public.enrichment_results
for each row execute function app.set_updated_at();

drop trigger if exists ai_emails_set_updated_at on public.ai_emails;
create trigger ai_emails_set_updated_at
before update on public.ai_emails
for each row execute function app.set_updated_at();

-- Sync auth.users -> public.users
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_auth_user();

-- When an organization is created, bind owner to that organization.
create or replace function app.handle_organization_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set organization_id = new.id
  where id = new.owner_user_id;
  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
after insert on public.organizations
for each row execute function app.handle_organization_created();

-- Organization context resolver for RLS.
create or replace function app.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.organization_id
  from public.users u
  where u.id = auth.uid()
    and u.deleted_at is null
  limit 1;
$$;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.signals enable row level security;
alter table public.signal_history enable row level security;
alter table public.retry_jobs enable row level security;
alter table public.uploads enable row level security;
alter table public.validation_results enable row level security;
alter table public.enrichment_results enable row level security;
alter table public.ai_emails enable row level security;

-- organizations policies
drop policy if exists organizations_select_own_org on public.organizations;
create policy organizations_select_own_org on public.organizations
for select using (id = app.current_organization_id() and deleted_at is null);

drop policy if exists organizations_insert_owner on public.organizations;
create policy organizations_insert_owner on public.organizations
for insert with check (owner_user_id = auth.uid());

drop policy if exists organizations_update_own_org on public.organizations;
create policy organizations_update_own_org on public.organizations
for update using (id = app.current_organization_id())
with check (id = app.current_organization_id());

-- users policies
drop policy if exists users_select_own_org on public.users;
create policy users_select_own_org on public.users
for select using (
  organization_id = app.current_organization_id()
  and deleted_at is null
);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
for insert with check (
  id = auth.uid()
  and (organization_id is null or organization_id = app.current_organization_id())
);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
for update using (id = auth.uid())
with check (
  id = auth.uid()
  and (organization_id is null or organization_id = app.current_organization_id())
);

-- Shared table policy template
drop policy if exists companies_select_own_org on public.companies;
create policy companies_select_own_org on public.companies
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists companies_insert_own_org on public.companies;
create policy companies_insert_own_org on public.companies
for insert with check (organization_id = app.current_organization_id());
drop policy if exists companies_update_own_org on public.companies;
create policy companies_update_own_org on public.companies
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists accounts_select_own_org on public.accounts;
create policy accounts_select_own_org on public.accounts
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists accounts_insert_own_org on public.accounts;
create policy accounts_insert_own_org on public.accounts
for insert with check (organization_id = app.current_organization_id());
drop policy if exists accounts_update_own_org on public.accounts;
create policy accounts_update_own_org on public.accounts
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists contacts_select_own_org on public.contacts;
create policy contacts_select_own_org on public.contacts
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists contacts_insert_own_org on public.contacts;
create policy contacts_insert_own_org on public.contacts
for insert with check (organization_id = app.current_organization_id());
drop policy if exists contacts_update_own_org on public.contacts;
create policy contacts_update_own_org on public.contacts
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists campaigns_select_own_org on public.campaigns;
create policy campaigns_select_own_org on public.campaigns
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists campaigns_insert_own_org on public.campaigns;
create policy campaigns_insert_own_org on public.campaigns
for insert with check (
  organization_id = app.current_organization_id()
  and created_by = auth.uid()
);
drop policy if exists campaigns_update_own_org on public.campaigns;
create policy campaigns_update_own_org on public.campaigns
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists signals_select_own_org on public.signals;
create policy signals_select_own_org on public.signals
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists signals_insert_own_org on public.signals;
create policy signals_insert_own_org on public.signals
for insert with check (organization_id = app.current_organization_id());
drop policy if exists signals_update_own_org on public.signals;
create policy signals_update_own_org on public.signals
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists signal_history_select_own_org on public.signal_history;
create policy signal_history_select_own_org on public.signal_history
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists signal_history_insert_own_org on public.signal_history;
create policy signal_history_insert_own_org on public.signal_history
for insert with check (organization_id = app.current_organization_id());
drop policy if exists signal_history_update_own_org on public.signal_history;
create policy signal_history_update_own_org on public.signal_history
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists retry_jobs_select_own_org on public.retry_jobs;
create policy retry_jobs_select_own_org on public.retry_jobs
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists retry_jobs_insert_own_org on public.retry_jobs;
create policy retry_jobs_insert_own_org on public.retry_jobs
for insert with check (organization_id = app.current_organization_id());
drop policy if exists retry_jobs_update_own_org on public.retry_jobs;
create policy retry_jobs_update_own_org on public.retry_jobs
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists uploads_select_own_org on public.uploads;
create policy uploads_select_own_org on public.uploads
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists uploads_insert_own_org on public.uploads;
create policy uploads_insert_own_org on public.uploads
for insert with check (
  organization_id = app.current_organization_id()
  and uploaded_by = auth.uid()
);
drop policy if exists uploads_update_own_org on public.uploads;
create policy uploads_update_own_org on public.uploads
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists validation_results_select_own_org on public.validation_results;
create policy validation_results_select_own_org on public.validation_results
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists validation_results_insert_own_org on public.validation_results;
create policy validation_results_insert_own_org on public.validation_results
for insert with check (organization_id = app.current_organization_id());
drop policy if exists validation_results_update_own_org on public.validation_results;
create policy validation_results_update_own_org on public.validation_results
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists enrichment_results_select_own_org on public.enrichment_results;
create policy enrichment_results_select_own_org on public.enrichment_results
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists enrichment_results_insert_own_org on public.enrichment_results;
create policy enrichment_results_insert_own_org on public.enrichment_results
for insert with check (organization_id = app.current_organization_id());
drop policy if exists enrichment_results_update_own_org on public.enrichment_results;
create policy enrichment_results_update_own_org on public.enrichment_results
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

drop policy if exists ai_emails_select_own_org on public.ai_emails;
create policy ai_emails_select_own_org on public.ai_emails
for select using (organization_id = app.current_organization_id() and deleted_at is null);
drop policy if exists ai_emails_insert_own_org on public.ai_emails;
create policy ai_emails_insert_own_org on public.ai_emails
for insert with check (organization_id = app.current_organization_id());
drop policy if exists ai_emails_update_own_org on public.ai_emails;
create policy ai_emails_update_own_org on public.ai_emails
for update using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

