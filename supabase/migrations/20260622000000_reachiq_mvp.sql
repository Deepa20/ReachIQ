create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'organization_role') then
    create type app.organization_role as enum ('owner', 'admin', 'member', 'viewer');
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
  if not exists (select 1 from pg_type where typname = 'upload_status') then
    create type app.upload_status as enum ('pending', 'processing', 'completed', 'failed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'validation_status') then
    create type app.validation_status as enum ('valid', 'risky', 'invalid');
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

do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_module') then
    create type app.campaign_module as enum ('validate', 'signal', 'agency');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type app.campaign_status as enum ('draft', 'active', 'paused', 'completed');
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
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type app.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
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

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text null,
  avatar_url text null,
  timezone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  domain citext null,
  industry text null,
  employee_count integer null check (employee_count >= 0),
  location jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, domain)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
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
  unique (organization_id, domain)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  first_name text null,
  last_name text null,
  email citext not null,
  title text null,
  linkedin_url text null,
  status app.contact_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null,
  file_path text not null,
  mime_type text null,
  row_count integer not null default 0 check (row_count >= 0),
  status app.upload_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.validation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  contact_id uuid null references public.contacts(id) on delete set null,
  validation_status app.validation_status not null,
  score integer not null default 0 check (score >= 0 and score <= 100),
  classification app.lead_classification not null default 'COLD',
  reasons jsonb not null default '[]'::jsonb,
  validated_at timestamptz not null default now()
);

alter table public.validation_results
add column if not exists classification app.lead_classification not null default 'COLD';

create table if not exists public.enrichment_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null,
  payload jsonb not null default '{}'::jsonb,
  enriched_at timestamptz not null default now(),
  unique (organization_id, contact_id, provider)
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid null references public.accounts(id) on delete set null,
  company_id uuid null references public.companies(id) on delete set null,
  signal_type text not null check (signal_type in ('funding', 'job_posting', 'company_news', 'executive_change', 'technology_change')),
  strength integer not null check (strength >= 1 and strength <= 5),
  signal_score integer not null default 0 check (signal_score between 0 and 100),
  summary text not null,
  source_url text null,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.signals
add column if not exists account_id uuid null references public.accounts(id) on delete set null;

alter table public.signals
add column if not exists signal_score integer not null default 0 check (signal_score between 0 and 100);

create table if not exists public.signal_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  signal_id uuid null references public.signals(id) on delete set null,
  event_type text not null check (event_type in ('account_started', 'signal_detected', 'score_updated', 'monitoring_paused', 'monitoring_resumed')),
  previous_score integer null check (previous_score between 0 and 100),
  new_score integer null check (new_score between 0 and 100),
  notes text null,
  payload jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  module app.campaign_module not null,
  status app.campaign_status not null default 'draft',
  created_by uuid not null references auth.users(id) on delete restrict,
  config jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid null references public.campaigns(id) on delete set null,
  contact_id uuid null references public.contacts(id) on delete set null,
  subject text not null,
  body text not null,
  tone text null,
  language text null,
  model_name text null,
  status app.ai_email_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  plan_code text not null default 'starter',
  status app.subscription_status not null default 'trialing',
  seats_included integer not null default 1 check (seats_included > 0),
  current_period_end timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contacts_org_company_idx on public.contacts (organization_id, company_id);
create index if not exists accounts_org_score_idx on public.accounts (organization_id, signal_score desc);
create index if not exists uploads_org_created_idx on public.uploads (organization_id, created_at desc);
create index if not exists signals_org_detected_idx on public.signals (organization_id, detected_at desc);
create index if not exists signals_account_detected_idx on public.signals (account_id, detected_at desc);
create index if not exists signal_history_org_event_idx on public.signal_history (organization_id, event_at desc);
create index if not exists retry_jobs_org_status_idx on public.retry_jobs (organization_id, status, next_attempt_at);
create index if not exists campaigns_org_created_idx on public.campaigns (organization_id, created_at desc);
create index if not exists ai_emails_org_created_idx on public.ai_emails (organization_id, created_at desc);
create index if not exists audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function app.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
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

drop trigger if exists signal_history_set_updated_at on public.signal_history;
create trigger signal_history_set_updated_at
before update on public.signal_history
for each row execute function app.set_updated_at();

drop trigger if exists retry_jobs_set_updated_at on public.retry_jobs;
create trigger retry_jobs_set_updated_at
before update on public.retry_jobs
for each row execute function app.set_updated_at();

drop trigger if exists ai_emails_set_updated_at on public.ai_emails;
create trigger ai_emails_set_updated_at
before update on public.ai_emails
for each row execute function app.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function app.set_updated_at();

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

create or replace function app.handle_organization_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (organization_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
after insert on public.organizations
for each row execute function app.handle_organization_created();

create or replace function app.current_org_role(target_org uuid)
returns app.organization_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = target_org
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function app.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function app.can_manage_org_data(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app.current_org_role(target_org) in ('owner', 'admin', 'member'), false);
$$;

create or replace function app.can_admin_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app.current_org_role(target_org) in ('owner', 'admin'), false);
$$;

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies enable row level security;
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.uploads enable row level security;
alter table public.validation_results enable row level security;
alter table public.enrichment_results enable row level security;
alter table public.signals enable row level security;
alter table public.signal_history enable row level security;
alter table public.retry_jobs enable row level security;
alter table public.campaigns enable row level security;
alter table public.ai_emails enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
for select using (id = auth.uid());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members on public.organizations
for select using (app.is_org_member(id));

drop policy if exists organizations_insert_owner on public.organizations;
create policy organizations_insert_owner on public.organizations
for insert with check (owner_user_id = auth.uid());

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
for update using (app.can_admin_org(id)) with check (app.can_admin_org(id));

drop policy if exists organizations_delete_owner on public.organizations;
create policy organizations_delete_owner on public.organizations
for delete using (app.current_org_role(id) = 'owner');

drop policy if exists organization_members_select_members on public.organization_members;
create policy organization_members_select_members on public.organization_members
for select using (app.is_org_member(organization_id));

drop policy if exists organization_members_insert_admin on public.organization_members;
create policy organization_members_insert_admin on public.organization_members
for insert with check (app.can_admin_org(organization_id));

drop policy if exists organization_members_update_admin on public.organization_members;
create policy organization_members_update_admin on public.organization_members
for update using (app.can_admin_org(organization_id)) with check (app.can_admin_org(organization_id));

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin on public.organization_members
for delete using (app.can_admin_org(organization_id));

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies
for select using (app.is_org_member(organization_id));

drop policy if exists companies_insert_member on public.companies;
create policy companies_insert_member on public.companies
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists companies_update_member on public.companies;
create policy companies_update_member on public.companies
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists companies_delete_admin on public.companies;
create policy companies_delete_admin on public.companies
for delete using (app.can_admin_org(organization_id));

drop policy if exists accounts_select_member on public.accounts;
create policy accounts_select_member on public.accounts
for select using (app.is_org_member(organization_id));

drop policy if exists accounts_insert_member on public.accounts;
create policy accounts_insert_member on public.accounts
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists accounts_update_member on public.accounts;
create policy accounts_update_member on public.accounts
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists accounts_delete_admin on public.accounts;
create policy accounts_delete_admin on public.accounts
for delete using (app.can_admin_org(organization_id));

drop policy if exists contacts_select_member on public.contacts;
create policy contacts_select_member on public.contacts
for select using (app.is_org_member(organization_id));

drop policy if exists contacts_insert_member on public.contacts;
create policy contacts_insert_member on public.contacts
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists contacts_update_member on public.contacts;
create policy contacts_update_member on public.contacts
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
for delete using (app.can_admin_org(organization_id));

drop policy if exists uploads_select_member on public.uploads;
create policy uploads_select_member on public.uploads
for select using (app.is_org_member(organization_id));

drop policy if exists uploads_insert_member on public.uploads;
create policy uploads_insert_member on public.uploads
for insert with check (
  app.can_manage_org_data(organization_id)
  and uploaded_by = auth.uid()
);

drop policy if exists uploads_update_member on public.uploads;
create policy uploads_update_member on public.uploads
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists uploads_delete_admin on public.uploads;
create policy uploads_delete_admin on public.uploads
for delete using (app.can_admin_org(organization_id));

drop policy if exists validation_results_select_member on public.validation_results;
create policy validation_results_select_member on public.validation_results
for select using (app.is_org_member(organization_id));

drop policy if exists validation_results_insert_member on public.validation_results;
create policy validation_results_insert_member on public.validation_results
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists validation_results_update_member on public.validation_results;
create policy validation_results_update_member on public.validation_results
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists validation_results_delete_admin on public.validation_results;
create policy validation_results_delete_admin on public.validation_results
for delete using (app.can_admin_org(organization_id));

drop policy if exists enrichment_results_select_member on public.enrichment_results;
create policy enrichment_results_select_member on public.enrichment_results
for select using (app.is_org_member(organization_id));

drop policy if exists enrichment_results_insert_member on public.enrichment_results;
create policy enrichment_results_insert_member on public.enrichment_results
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists enrichment_results_update_member on public.enrichment_results;
create policy enrichment_results_update_member on public.enrichment_results
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists enrichment_results_delete_admin on public.enrichment_results;
create policy enrichment_results_delete_admin on public.enrichment_results
for delete using (app.can_admin_org(organization_id));

drop policy if exists signals_select_member on public.signals;
create policy signals_select_member on public.signals
for select using (app.is_org_member(organization_id));

drop policy if exists signals_insert_member on public.signals;
create policy signals_insert_member on public.signals
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists signals_update_member on public.signals;
create policy signals_update_member on public.signals
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists signals_delete_admin on public.signals;
create policy signals_delete_admin on public.signals
for delete using (app.can_admin_org(organization_id));

drop policy if exists signal_history_select_member on public.signal_history;
create policy signal_history_select_member on public.signal_history
for select using (app.is_org_member(organization_id));

drop policy if exists signal_history_insert_member on public.signal_history;
create policy signal_history_insert_member on public.signal_history
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists signal_history_update_member on public.signal_history;
create policy signal_history_update_member on public.signal_history
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists signal_history_delete_admin on public.signal_history;
create policy signal_history_delete_admin on public.signal_history
for delete using (app.can_admin_org(organization_id));

drop policy if exists retry_jobs_select_member on public.retry_jobs;
create policy retry_jobs_select_member on public.retry_jobs
for select using (app.is_org_member(organization_id));

drop policy if exists retry_jobs_insert_member on public.retry_jobs;
create policy retry_jobs_insert_member on public.retry_jobs
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists retry_jobs_update_member on public.retry_jobs;
create policy retry_jobs_update_member on public.retry_jobs
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists retry_jobs_delete_admin on public.retry_jobs;
create policy retry_jobs_delete_admin on public.retry_jobs
for delete using (app.can_admin_org(organization_id));

drop policy if exists campaigns_select_member on public.campaigns;
create policy campaigns_select_member on public.campaigns
for select using (app.is_org_member(organization_id));

drop policy if exists campaigns_insert_member on public.campaigns;
create policy campaigns_insert_member on public.campaigns
for insert with check (
  app.can_manage_org_data(organization_id)
  and created_by = auth.uid()
);

drop policy if exists campaigns_update_member on public.campaigns;
create policy campaigns_update_member on public.campaigns
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists campaigns_delete_admin on public.campaigns;
create policy campaigns_delete_admin on public.campaigns
for delete using (app.can_admin_org(organization_id));

drop policy if exists ai_emails_select_member on public.ai_emails;
create policy ai_emails_select_member on public.ai_emails
for select using (app.is_org_member(organization_id));

drop policy if exists ai_emails_insert_member on public.ai_emails;
create policy ai_emails_insert_member on public.ai_emails
for insert with check (app.can_manage_org_data(organization_id));

drop policy if exists ai_emails_update_member on public.ai_emails;
create policy ai_emails_update_member on public.ai_emails
for update using (app.can_manage_org_data(organization_id)) with check (app.can_manage_org_data(organization_id));

drop policy if exists ai_emails_delete_admin on public.ai_emails;
create policy ai_emails_delete_admin on public.ai_emails
for delete using (app.can_admin_org(organization_id));

drop policy if exists subscriptions_select_member on public.subscriptions;
create policy subscriptions_select_member on public.subscriptions
for select using (app.is_org_member(organization_id));

drop policy if exists subscriptions_insert_admin on public.subscriptions;
create policy subscriptions_insert_admin on public.subscriptions
for insert with check (app.can_admin_org(organization_id));

drop policy if exists subscriptions_update_admin on public.subscriptions;
create policy subscriptions_update_admin on public.subscriptions
for update using (app.can_admin_org(organization_id)) with check (app.can_admin_org(organization_id));

drop policy if exists subscriptions_delete_owner on public.subscriptions;
create policy subscriptions_delete_owner on public.subscriptions
for delete using (app.current_org_role(organization_id) = 'owner');

drop policy if exists audit_logs_select_member on public.audit_logs;
create policy audit_logs_select_member on public.audit_logs
for select using (app.is_org_member(organization_id));

drop policy if exists audit_logs_insert_member on public.audit_logs;
create policy audit_logs_insert_member on public.audit_logs
for insert with check (
  app.is_org_member(organization_id)
  and (actor_user_id is null or actor_user_id = auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 104857600, array['text/csv', 'application/csv', 'application/vnd.ms-excel'])
on conflict (id) do nothing;

drop policy if exists uploads_bucket_select on storage.objects;
create policy uploads_bucket_select on storage.objects
for select using (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and app.is_org_member((split_part(name, '/', 1))::uuid)
);

drop policy if exists uploads_bucket_insert on storage.objects;
create policy uploads_bucket_insert on storage.objects
for insert with check (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and app.can_manage_org_data((split_part(name, '/', 1))::uuid)
);

drop policy if exists uploads_bucket_update on storage.objects;
create policy uploads_bucket_update on storage.objects
for update using (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and app.can_manage_org_data((split_part(name, '/', 1))::uuid)
);

drop policy if exists uploads_bucket_delete on storage.objects;
create policy uploads_bucket_delete on storage.objects
for delete using (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and app.can_admin_org((split_part(name, '/', 1))::uuid)
);
