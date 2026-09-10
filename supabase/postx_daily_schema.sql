-- PostX Daily database objects. Run this file in the Supabase SQL editor.
create extension if not exists pgcrypto;

-- These columns make the existing profiles table usable for team permissions.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'agent';
do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('manager', 'agent'));
exception when duplicate_object then null; end $$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager') $$;
revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  notes text,
  status text not null default 'todo' check (status in ('todo', 'wip', 'completed')),
  task_date date not null default current_date,
  time_taken text,
  action_taken text,
  completion_comment text,
  moved_to_wip_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.daily_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  comment_type text not null default 'note' check (comment_type in ('progress', 'completion', 'reopen', 'note')),
  comment text,
  action_taken text,
  time_taken text,
  created_at timestamptz not null default now()
);

create index if not exists daily_tasks_owner_date_status_idx on public.daily_tasks(owner_id, task_date, status);
create index if not exists daily_task_comments_task_idx on public.daily_task_comments(task_id, created_at);

create or replace function public.touch_daily_task()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists daily_tasks_updated_at on public.daily_tasks;
create trigger daily_tasks_updated_at before update on public.daily_tasks for each row execute function public.touch_daily_task();

alter table public.daily_tasks enable row level security;
alter table public.daily_task_comments enable row level security;

drop policy if exists "owners and managers read tasks" on public.daily_tasks;
create policy "owners and managers read tasks" on public.daily_tasks for select to authenticated using (owner_id = auth.uid() or public.is_manager());
drop policy if exists "owners and managers create tasks" on public.daily_tasks;
create policy "owners and managers create tasks" on public.daily_tasks for insert to authenticated with check ((owner_id = auth.uid() or public.is_manager()) and created_by = auth.uid());
drop policy if exists "owners and managers update tasks" on public.daily_tasks;
create policy "owners and managers update tasks" on public.daily_tasks for update to authenticated using (owner_id = auth.uid() or public.is_manager()) with check (owner_id = auth.uid() or public.is_manager());
drop policy if exists "owners and managers delete tasks" on public.daily_tasks;
create policy "owners and managers delete tasks" on public.daily_tasks for delete to authenticated using (owner_id = auth.uid() or public.is_manager());

drop policy if exists "owners and managers read comments" on public.daily_task_comments;
create policy "owners and managers read comments" on public.daily_task_comments for select to authenticated using (exists (select 1 from public.daily_tasks t where t.id = task_id and (t.owner_id = auth.uid() or public.is_manager())));
drop policy if exists "owners and managers create comments" on public.daily_task_comments;
create policy "owners and managers create comments" on public.daily_task_comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.daily_tasks t where t.id = task_id and (t.owner_id = auth.uid() or public.is_manager())));
drop policy if exists "owners and managers update comments" on public.daily_task_comments;
create policy "owners and managers update comments" on public.daily_task_comments for update to authenticated using (user_id = auth.uid() or public.is_manager()) with check (user_id = auth.uid() or public.is_manager());
drop policy if exists "owners and managers delete comments" on public.daily_task_comments;
create policy "owners and managers delete comments" on public.daily_task_comments for delete to authenticated using (user_id = auth.uid() or public.is_manager());

-- Profiles must be readable for the manager selector. Existing stricter policies may
-- remain alongside this one; permissive policies are ORed by PostgreSQL.
alter table public.profiles enable row level security;
drop policy if exists "users read self managers read team" on public.profiles;
create policy "users read self managers read team" on public.profiles for select to authenticated using (id = auth.uid() or public.is_manager());
drop policy if exists "users create own profile" on public.profiles;
create policy "users create own profile" on public.profiles for insert to authenticated with check (id = auth.uid() and role = 'agent');
-- Profile role changes are intentionally not granted through an authenticated
-- update policy. Assign roles in the SQL editor as a database administrator.
drop policy if exists "users update own profile basics" on public.profiles;
