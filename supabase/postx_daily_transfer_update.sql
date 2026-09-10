-- PostX Daily task transfers and notifications. Run this entire file once in the
-- Supabase SQL editor. Every schema statement is safe to run again.
alter table public.daily_tasks
add column if not exists timer_started_at timestamptz;

update public.daily_tasks
set timer_started_at = created_at
where timer_started_at is null;

alter table public.daily_tasks
alter column timer_started_at set default now();

-- Permit transfer entries in the existing activity history.
alter table public.daily_task_comments
drop constraint if exists daily_task_comments_comment_type_check;
alter table public.daily_task_comments
add constraint daily_task_comments_comment_type_check
check (comment_type in ('progress', 'completion', 'reopen', 'note', 'transfer'));

create table if not exists public.postx_daily_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.daily_tasks(id) on delete cascade,
  title text not null,
  message text,
  type text not null default 'task_transfer',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists postx_daily_notifications_user_unread_idx
on public.postx_daily_notifications(user_id, created_at desc)
where read_at is null;

alter table public.postx_daily_notifications enable row level security;
drop policy if exists "users read own daily notifications" on public.postx_daily_notifications;
create policy "users read own daily notifications"
on public.postx_daily_notifications for select to authenticated
using (user_id = auth.uid());
drop policy if exists "users update own daily notifications" on public.postx_daily_notifications;
create policy "users update own daily notifications"
on public.postx_daily_notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "managers insert daily notifications" on public.postx_daily_notifications;
create policy "managers insert daily notifications"
on public.postx_daily_notifications for insert to authenticated
with check (public.is_manager());

-- Perform the ownership change, activity entry, and notification atomically.
-- SECURITY DEFINER is constrained by the explicit manager and recipient checks.
create or replace function public.transfer_daily_task(
  p_task_id uuid,
  p_new_owner_id uuid,
  p_task_date date,
  p_recipient_name text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_manager() then
    raise exception 'Only managers can transfer tasks' using errcode = '42501';
  end if;

  select * into v_task from public.daily_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if p_new_owner_id = v_task.owner_id then raise exception 'Select a different owner'; end if;
  if not exists (select 1 from public.profiles where id = p_new_owner_id) then
    raise exception 'Transfer recipient not found';
  end if;

  update public.daily_tasks set
    owner_id = p_new_owner_id,
    status = 'todo',
    task_date = coalesce(p_task_date, current_date),
    completed_at = null,
    wip_tag = null,
    timer_started_at = v_now,
    updated_by = auth.uid(),
    updated_at = v_now
  where id = p_task_id;

  insert into public.daily_task_comments
    (task_id, user_id, comment_type, comment, action_taken, created_at)
  values
    (p_task_id, auth.uid(), 'transfer',
     coalesce(nullif(trim(p_note), ''), 'Task transferred.'),
     'Task transferred to ' || coalesce(nullif(trim(p_recipient_name), ''), 'new owner'), v_now);

  insert into public.postx_daily_notifications
    (user_id, task_id, title, message, type, created_at)
  values
    (p_new_owner_id, p_task_id, 'Task transferred to you',
     'A task has been transferred to you: ' || v_task.title, 'task_transfer', v_now);
end;
$$;

revoke all on function public.transfer_daily_task(uuid, uuid, date, text, text) from public;
grant execute on function public.transfer_daily_task(uuid, uuid, date, text, text) to authenticated;
