-- SIRA - Security hardening (pre-VAPT retest)
-- 2026-11-11
--
-- Safe to run more than once. Deletes no rows of any kind.
--
-- Deploy the updated sira-user-admin Edge Function in the same session.
--
-- Contents
--   1. No administrators: email addresses no longer grant admin rights
--   2. Self sign-up is always open (checked with hCaptcha in the Edge Function)
--   3. Server-side login lockout (5 failures -> 15 minutes)
--   4. Force a password change on accounts still using <name>@123
--   5. Reporter and comment identity filled by the server
--   6. Unused workflow RPC no longer callable by app users
--   7. Fixes from the live check on 2026-11-11:
--      a. remove the policy that let ANY user delete ANY incident
--      b. remove table rights from the anonymous role
--      c. users may edit only their job title on their profile
--      d. internal trigger functions not callable as API functions

begin;

-- ---------------------------------------------------------------------------
-- 1) No administrators
--    SIRA has no admin role. Admin rights used to follow an email address, so
--    anyone who signed up with a listed address (e.g. admin@gmail.com) became
--    an admin. The Edge Function now only honours sira_admins.user_id, which
--    is deliberately left empty, so no account has admin rights.
-- ---------------------------------------------------------------------------
alter table public.sira_admins
  add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2) Self sign-up is always open. Nothing to change in the database: the Edge
--    Function no longer reads the on/off switch and verifies hCaptcha itself.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3) Server-side login lockout
--    Used by the Password Verification Attempt Auth Hook (sign-in) and by the
--    Edge Function's change-password check. 5 failures within 15 minutes lock
--    the account for 15 minutes.
-- ---------------------------------------------------------------------------
create table if not exists public.sira_auth_login_failures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count integer not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz
);

alter table public.sira_auth_login_failures enable row level security;
revoke all on table public.sira_auth_login_failures from public, anon, authenticated;
-- No policies: only the SECURITY DEFINER functions below touch this table.

create or replace function public.sira_login_locked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sira_auth_login_failures
    where user_id = p_user_id and locked_until > now()
  );
$$;

-- Records one failure; returns true when the account is now locked.
create or replace function public.sira_record_login_failure(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.sira_auth_login_failures as f (user_id, failed_count, last_failed_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set failed_count = case
          when f.locked_until is not null and f.locked_until <= now() then 1
          when f.last_failed_at < now() - interval '15 minutes' then 1
          else f.failed_count + 1
        end,
        locked_until = case
          when f.locked_until is not null and f.locked_until <= now() then null
          else f.locked_until
        end,
        last_failed_at = now()
  returning failed_count into v_count;

  if v_count >= 5 then
    update public.sira_auth_login_failures
    set locked_until = now() + interval '15 minutes'
    where user_id = p_user_id;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.sira_clear_login_failures(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.sira_auth_login_failures where user_id = p_user_id;
$$;

-- Auth Hook: Dashboard > Authentication > Hooks > Password Verification Attempt
create or replace function public.sira_password_verification_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (event->>'user_id')::uuid;
  v_valid boolean := coalesce((event->>'valid')::boolean, false);
  v_locked_message constant text := 'Too many failed attempts. Try again in 15 minutes.';
begin
  if public.sira_login_locked(v_user) then
    return jsonb_build_object('decision', 'reject', 'message', v_locked_message, 'should_logout_user', false);
  end if;

  if v_valid then
    perform public.sira_clear_login_failures(v_user);
    return jsonb_build_object('decision', 'continue');
  end if;

  if public.sira_record_login_failure(v_user) then
    return jsonb_build_object('decision', 'reject', 'message', v_locked_message, 'should_logout_user', false);
  end if;

  return jsonb_build_object('decision', 'continue');
end;
$$;

-- Checks a user's current password for the change-password action.
-- Returns 'ok', 'invalid' or 'locked'.
create or replace function public.sira_check_user_password(p_user_id uuid, p_password text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
begin
  if public.sira_login_locked(p_user_id) then
    return 'locked';
  end if;

  select encrypted_password into v_hash from auth.users where id = p_user_id;

  if coalesce(v_hash, '') <> '' and v_hash = extensions.crypt(coalesce(p_password, ''), v_hash) then
    perform public.sira_clear_login_failures(p_user_id);
    return 'ok';
  end if;

  if public.sira_record_login_failure(p_user_id) then
    return 'locked';
  end if;

  return 'invalid';
end;
$$;

revoke all on function public.sira_login_locked(uuid) from public, anon, authenticated;
revoke all on function public.sira_record_login_failure(uuid) from public, anon, authenticated;
revoke all on function public.sira_clear_login_failures(uuid) from public, anon, authenticated;
revoke all on function public.sira_password_verification_hook(jsonb) from public, anon, authenticated;
revoke all on function public.sira_check_user_password(uuid, text) from public, anon, authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.sira_password_verification_hook(jsonb) to supabase_auth_admin;
grant execute on function public.sira_login_locked(uuid) to supabase_auth_admin, service_role;
grant execute on function public.sira_record_login_failure(uuid) to supabase_auth_admin, service_role;
grant execute on function public.sira_clear_login_failures(uuid) to supabase_auth_admin, service_role;
grant execute on function public.sira_check_user_password(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Force a password change on accounts still using the imported
--    <local-part>@123 password. Only app_metadata is changed; passwords are
--    not touched. New administrator-created accounts get the same flag from
--    the Edge Function.
-- ---------------------------------------------------------------------------
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb
where email like '%@sira.net'
  and coalesce(encrypted_password, '') <> ''
  and encrypted_password = extensions.crypt(split_part(email, '@', 1) || '@123', encrypted_password);

-- While flagged, the account can sign in and change its password, but sees
-- and writes no incident data. RESTRICTIVE = combined with existing policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sira_incidents',
    'sira_incident_stage_history',
    'sira_incident_comments'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists "sira_block_until_password_changed" on public.%I', t);
    execute format(
      $p$create policy "sira_block_until_password_changed" on public.%I
         as restrictive for all to authenticated
         using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'must_change_password'), 'false') <> 'true')
         with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'must_change_password'), 'false') <> 'true')$p$,
      t
    );
  end loop;
end;
$$;

drop policy if exists "incident_photos_block_until_password_changed" on storage.objects;
create policy "incident_photos_block_until_password_changed" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'incident-photos'
         or coalesce((select auth.jwt() -> 'app_metadata' ->> 'must_change_password'), 'false') <> 'true')
  with check (bucket_id <> 'incident-photos'
         or coalesce((select auth.jwt() -> 'app_metadata' ->> 'must_change_password'), 'false') <> 'true');

-- ---------------------------------------------------------------------------
-- 5) Reporter and comment identity filled by the server
--    The apps already send these same values; this stops a direct API call
--    from inserting another person's name or phone number.
-- ---------------------------------------------------------------------------
create or replace function public.sira_fill_reporter_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
begin
  if tg_op = 'INSERT' then
    select full_name, job_title, role, company, mobile_number
    into p
    from public.sira_user_profiles
    where id = auth.uid();

    if found then
      new.reported_by_name := coalesce(nullif(btrim(p.full_name), ''), new.reported_by_name);
      new.reported_by_company := coalesce(nullif(btrim(p.company), ''), new.reported_by_company);
      new.reported_by_phone := coalesce(nullif(btrim(p.mobile_number), ''), new.reported_by_phone);
      new.reported_by_job_title := coalesce(
        nullif(btrim(p.job_title), ''),
        nullif(btrim(p.role), ''),
        new.reported_by_job_title
      );
    end if;
  elsif auth.uid() is not null then
    -- App users cannot rewrite who reported an incident or when.
    -- reported_by_job_title stays editable: the More tab keeps it in step.
    new.reporter_user_id := old.reporter_user_id;
    new.created_at := old.created_at;
    new.reported_by_name := old.reported_by_name;
    new.reported_by_company := old.reported_by_company;
    new.reported_by_phone := old.reported_by_phone;
  end if;

  return new;
end;
$$;

revoke all on function public.sira_fill_reporter_identity() from public, anon, authenticated;

drop trigger if exists trg_sira_fill_reporter_identity on public.sira_incidents;
create trigger trg_sira_fill_reporter_identity
before insert or update on public.sira_incidents
for each row execute function public.sira_fill_reporter_identity();

do $$
begin
  if to_regclass('public.sira_incident_comments') is null then
    return;
  end if;

  execute $f$
    create or replace function public.sira_fill_comment_identity()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $body$
    declare
      v_name text;
    begin
      if auth.uid() is null then
        return new;
      end if;

      select coalesce(nullif(btrim(full_name), ''), nullif(btrim(username), ''))
      into v_name
      from public.sira_user_profiles
      where id = auth.uid();

      new.user_id := auth.uid();
      new.username := coalesce(v_name, new.username);
      return new;
    end;
    $body$
  $f$;

  execute 'revoke all on function public.sira_fill_comment_identity() from public, anon, authenticated';
  execute 'drop trigger if exists trg_sira_fill_comment_identity on public.sira_incident_comments';
  execute 'create trigger trg_sira_fill_comment_identity
           before insert on public.sira_incident_comments
           for each row execute function public.sira_fill_comment_identity()';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Workflow RPC
--    Neither app calls update_sira_incident_workflow; stage changes go through
--    the owner-only incident edit. As SECURITY DEFINER it let any user change
--    any incident, so app users can no longer call it. The function is kept.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.update_sira_incident_workflow(uuid, text, text, text, text, text)') is not null then
    execute 'revoke execute on function public.update_sira_incident_workflow(uuid, text, text, text, text, text) from public, anon, authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7a) CRITICAL: "sira_incidents_delete_authenticated" was DELETE using (true).
--     Permissive policies are OR-ed, so it overrode the owner-only rule and let
--     any signed-in user delete any incident. The owner-only delete policies
--     ("sira_incidents_delete_owner", "Uploader can delete own incidents")
--     remain, so reporters can still delete their own incidents.
-- ---------------------------------------------------------------------------
drop policy if exists "sira_incidents_delete_authenticated" on public.sira_incidents;

-- ---------------------------------------------------------------------------
-- 7b) The anonymous (not signed-in) role had full rights on these tables.
--     RLS blocked it, but table rights should not depend on that alone.
--     Signed-in users also do not need TRUNCATE (which bypasses RLS),
--     TRIGGER or REFERENCES.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sira_incidents',
    'sira_incident_stage_history',
    'sira_incident_comments',
    'sira_user_profiles',
    'sira_admins',
    'sira_app_settings',
    'sira_auth_login_failures'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);
  end loop;
end;
$$;

-- History rows are written only by the audit trigger.
revoke insert, update, delete on table public.sira_incident_stage_history from authenticated;

-- Comments: the app adds and reads comments; there are no edit/delete
-- policies, so drop the matching rights too.
revoke update, delete on table public.sira_incident_comments from authenticated;

-- ---------------------------------------------------------------------------
-- 7c) Profiles: users could rename themselves (full_name, username), and
--     those names appear in the incident audit history. The More tab edits
--     only job title (and role, kept equal to it). Name, company and mobile
--     changes go through the Edge Function (service role), which is unaffected.
-- ---------------------------------------------------------------------------
revoke update on table public.sira_user_profiles from authenticated;
grant update (job_title, role, updated_at) on table public.sira_user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 7d) Trigger functions run as part of their triggers; nobody needs to call
--     them as API functions. Triggers keep firing after this.
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Checks after running (read-only)
-- ---------------------------------------------------------------------------
-- No account should have admin rights (expect 0):
--   select count(*) from public.sira_admins where user_id is not null;
--
-- Accounts now required to change password:
--   select count(*) from auth.users where raw_app_meta_data ->> 'must_change_password' = 'true';
--
--
-- Then enable the hook: Dashboard > Authentication > Hooks >
--   Password Verification Attempt > Postgres function >
--   public.sira_password_verification_hook
--
-- Rollback (if ever needed):
--   drop policy "sira_block_until_password_changed" on public.sira_incidents;  (and the other tables)
--   drop policy "incident_photos_block_until_password_changed" on storage.objects;
--   drop trigger trg_sira_fill_reporter_identity on public.sira_incidents;
--   drop trigger trg_sira_fill_comment_identity on public.sira_incident_comments;
--   grant execute on function public.update_sira_incident_workflow(uuid, text, text, text, text, text) to authenticated;
