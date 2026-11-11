-- SIRA Fiber Risk-only update for an EXISTING Supabase project.
-- Run once in Supabase SQL Editor before using the updated mobile app.
-- Legacy non-FR rows are retained, but all new/updated incident rows must be FR.

begin;

alter table public.sira_incidents
  add column if not exists support_required text,
  add column if not exists reported_by_company text,
  add column if not exists reporter_user_id uuid references auth.users(id) on delete set null;

-- Replace older incident-type/status checks without deleting historical records.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.sira_incidents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%incident_type%'
  loop
    execute format('alter table public.sira_incidents drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.sira_incidents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.sira_incidents drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.sira_incidents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%photo_urls%'
  loop
    execute format('alter table public.sira_incidents drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.sira_incidents
  add constraint sira_incidents_fiber_risk_only
  check (incident_type = 'fiber_network_risk') not valid;

-- Keep legacy status values readable while allowing only the three operational
-- statuses used by the updated app for new activity.
alter table public.sira_incidents
  add constraint sira_incidents_status_allowed
  check (
    status in (
      'open', 'in_progress', 'resolved',
      'submitted', 'draft', 'under_review', 'rejected'
    )
  ) not valid;

alter table public.sira_incidents
  add constraint sira_incidents_max_two_photos
  check (coalesce(array_length(photo_urls, 1), 0) <= 2) not valid;

create index if not exists idx_sira_incidents_fiber_status_created
  on public.sira_incidents (incident_type, status, created_at desc);

alter table if exists public.sira_user_profiles
  add column if not exists username text;

do $$
begin
  if to_regclass('public.sira_user_profiles') is not null then
    execute $sql$
      create unique index if not exists uq_sira_user_profiles_username
      on public.sira_user_profiles (lower(username))
      where username is not null and btrim(username) <> ''
    $sql$;
  end if;
end $$;

alter table public.sira_incidents enable row level security;

drop policy if exists "sira_incidents_insert_mvp" on public.sira_incidents;
drop policy if exists "sira_incidents_select_mvp" on public.sira_incidents;
drop policy if exists "sira_incidents_update_mvp" on public.sira_incidents;
drop policy if exists "sira_incidents_delete_mvp" on public.sira_incidents;
drop policy if exists "sira_incidents_select_authenticated" on public.sira_incidents;
drop policy if exists "sira_incidents_insert_authenticated" on public.sira_incidents;
drop policy if exists "sira_incidents_update_owner" on public.sira_incidents;
drop policy if exists "sira_incidents_delete_owner" on public.sira_incidents;

create policy "sira_incidents_select_authenticated"
on public.sira_incidents
for select
to authenticated
using (incident_type = 'fiber_network_risk');

create policy "sira_incidents_insert_authenticated"
on public.sira_incidents
for insert
to authenticated
with check (
  incident_type = 'fiber_network_risk'
  and reporter_user_id = auth.uid()
  and coalesce(array_length(photo_urls, 1), 0) <= 2
);

create policy "sira_incidents_update_owner"
on public.sira_incidents
for update
to authenticated
using (
  incident_type = 'fiber_network_risk'
  and reporter_user_id = auth.uid()
)
with check (
  incident_type = 'fiber_network_risk'
  and reporter_user_id = auth.uid()
  and coalesce(array_length(photo_urls, 1), 0) <= 2
);

create policy "sira_incidents_delete_owner"
on public.sira_incidents
for delete
to authenticated
using (
  incident_type = 'fiber_network_risk'
  and reporter_user_id = auth.uid()
);

insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "incident_photos_insert_mvp" on storage.objects;
drop policy if exists "incident_photos_select_mvp" on storage.objects;
drop policy if exists "incident_photos_update_mvp" on storage.objects;
drop policy if exists "incident_photos_delete_mvp" on storage.objects;
drop policy if exists "incident_photos_select_authenticated" on storage.objects;
drop policy if exists "incident_photos_insert_authenticated" on storage.objects;
drop policy if exists "incident_photos_update_authenticated" on storage.objects;
drop policy if exists "incident_photos_delete_authenticated" on storage.objects;

create policy "incident_photos_select_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'incident-photos');

create policy "incident_photos_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'incident-photos');

create policy "incident_photos_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'incident-photos')
with check (bucket_id = 'incident-photos');

create policy "incident_photos_delete_authenticated"
on storage.objects
for delete
to authenticated
using (bucket_id = 'incident-photos');

commit;
