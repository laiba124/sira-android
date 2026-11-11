-- SIRA - Live security state checks (READ-ONLY)
-- 2026-11-11
--
-- Changes nothing. Run in Supabase Dashboard > SQL Editor, BEFORE applying
-- APPLY_20261111_A_SECURITY_HARDENING.sql. Run each numbered query on its own
-- and send back the results (screenshot or copy). No passwords or personal
-- data are returned, only counts, names of settings and policy text.

-- 1) Which tables have Row Level Security switched on?
--    Expected: rowsecurity = true for every sira_* table.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2) All deployed access policies (tables + storage).
--    Most important rows: sira_user_profiles, sira_incident_comments, storage.objects.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 3) Is the photo bucket public?
select id, public, file_size_limit, allowed_mime_types
from storage.buckets;

-- 4) What can the anonymous (not signed-in) and signed-in roles do on each table?
--    Expected: anon has nothing on sira_* tables.
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by table_name, grantee;

-- 5) Database functions that run with elevated rights (SECURITY DEFINER),
--    and who may call them. Expected: anon_can_call = false for all.
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as settings,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;

-- 6) How many accounts still use the imported <name>@123 password?
--    Returns a count only.
select count(*) as accounts_on_default_password
from auth.users
where email like '%@sira.net'
  and coalesce(encrypted_password, '') <> ''
  and encrypted_password = extensions.crypt(split_part(email, '@', 1) || '@123', encrypted_password);

-- 7) Administrator list, and whether each address has a real account.
select a.email,
       exists (select 1 from auth.users u where lower(u.email) = a.email) as has_account
from public.sira_admins a
order by a.email;

-- 8) Is self sign-up currently on?
select signup_enabled from public.sira_app_settings;

-- 9) Do the profile and comment tables exist, and what columns can signed-in
--    users update? (Answers whether a user can rename themselves.)
select table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('sira_user_profiles', 'sira_incident_comments')
  and grantee = 'authenticated'
order by table_name, column_name, privilege_type;

-- 10) Is MFA in use by anyone yet? (Counts only.)
select factor_type, status, count(*)
from auth.mfa_factors
group by factor_type, status;
