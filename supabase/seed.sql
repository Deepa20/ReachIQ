-- ReachIQ seed bootstrap (non-mock)
-- Safe to run multiple times.

-- Backfill profile rows for already-existing auth users.
insert into public.users (id, full_name, avatar_url)
select
  au.id,
  coalesce(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  au.raw_user_meta_data->>'avatar_url'
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;

-- Private bucket for uploaded lead files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  104857600,
  array['text/csv', 'application/csv', 'application/vnd.ms-excel']
)
on conflict (id) do nothing;

-- Storage access scoped to org-id path prefix:
-- uploads/<organization_uuid>/...
drop policy if exists uploads_bucket_select on storage.objects;
create policy uploads_bucket_select on storage.objects
for select using (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (split_part(name, '/', 1))::uuid = app.current_organization_id()
);

drop policy if exists uploads_bucket_insert on storage.objects;
create policy uploads_bucket_insert on storage.objects
for insert with check (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (split_part(name, '/', 1))::uuid = app.current_organization_id()
);

drop policy if exists uploads_bucket_update on storage.objects;
create policy uploads_bucket_update on storage.objects
for update using (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (split_part(name, '/', 1))::uuid = app.current_organization_id()
);

drop policy if exists uploads_bucket_delete on storage.objects;
create policy uploads_bucket_delete on storage.objects
for delete using (
  bucket_id = 'uploads'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (split_part(name, '/', 1))::uuid = app.current_organization_id()
);
