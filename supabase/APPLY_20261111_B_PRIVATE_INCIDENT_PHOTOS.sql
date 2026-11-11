-- SIRA - Private incident photos
-- 2026-11-11
--
-- RUN ONLY AFTER the updated Android APK and the updated Web app are in use.
-- Both now show photos through short-lived signed URLs. Older builds load the
-- public URL directly, and their images stop showing once this runs.
--
-- Deletes no files and no rows. Existing photo_urls values keep working: the
-- apps read the storage path out of them.
--
-- After this:
--   - photos cannot be opened without signing in (no public links)
--   - only the incident's reporter can add, replace or delete its photos
--   - uploads limited to images up to 10 MB
--
-- Rollback: update storage.buckets set public = true where id = 'incident-photos';

begin;

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'incident-photos';

drop policy if exists "incident_photos_select_authenticated" on storage.objects;
drop policy if exists "incident_photos_insert_authenticated" on storage.objects;
drop policy if exists "incident_photos_update_authenticated" on storage.objects;
drop policy if exists "incident_photos_delete_authenticated" on storage.objects;
drop policy if exists "incident_photos_insert_owner" on storage.objects;
drop policy if exists "incident_photos_update_owner" on storage.objects;
drop policy if exists "incident_photos_delete_owner" on storage.objects;

-- Every signed-in SIRA user can view incident photos (same as incident rows).
create policy "incident_photos_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'incident-photos');

-- Files live under <incident id>/..., and only that incident's reporter may
-- write there. The apps already create the incident first, then upload.
create policy "incident_photos_insert_owner"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'incident-photos'
  and exists (
    select 1 from public.sira_incidents i
    where i.id::text = (storage.foldername(name))[1]
      and i.reporter_user_id = (select auth.uid())
  )
);

create policy "incident_photos_update_owner"
on storage.objects for update to authenticated
using (
  bucket_id = 'incident-photos'
  and exists (
    select 1 from public.sira_incidents i
    where i.id::text = (storage.foldername(name))[1]
      and i.reporter_user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'incident-photos'
  and exists (
    select 1 from public.sira_incidents i
    where i.id::text = (storage.foldername(name))[1]
      and i.reporter_user_id = (select auth.uid())
  )
);

create policy "incident_photos_delete_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'incident-photos'
  and exists (
    select 1 from public.sira_incidents i
    where i.id::text = (storage.foldername(name))[1]
      and i.reporter_user_id = (select auth.uid())
  )
);

commit;

-- Checks (read-only):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'incident-photos';
--   select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'incident_photos%';
