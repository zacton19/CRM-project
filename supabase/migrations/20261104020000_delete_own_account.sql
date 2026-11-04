-- Lets a signed-in user permanently delete their own account (required by App Store
-- guideline 5.1.1(v) for apps that offer sign-up). Deleting the auth.users row cascades
-- to clients, quotes, job_series, jobs and user_settings via their ON DELETE CASCADE keys.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
