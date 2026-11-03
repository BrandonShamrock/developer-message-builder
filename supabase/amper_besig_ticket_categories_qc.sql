-- Run after postx_daily_schema.sql, postx_daily_kanban_update.sql and
-- postx_daily_transfer_update.sql. Review and run manually; safe to repeat.
begin;
alter table public.daily_tasks add column if not exists category text;
update public.daily_tasks set category = 'Other' where category is null or btrim(category) = '';
alter table public.daily_tasks alter column category set not null;
alter table public.daily_tasks alter column category drop default;
-- No DEFAULT: new API clients must explicitly choose a category.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.daily_tasks'::regclass and conname = 'daily_tasks_category_check') then
    alter table public.daily_tasks add constraint daily_tasks_category_check check (category in ('Onboarding','Support','Fix','Update','Assistance','Internal','Meeting','Other'));
  end if;
end $$;
create table if not exists public.daily_task_onboarding_qc (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.daily_tasks(id) on delete cascade,
  setup_type text not null check (setup_type in ('PostX Organisation','Subgroups','Members','SLA','Quick Replies','Open Hours','WABAs','Routing','Automated Replies','Integration','Conexa','AI','Social Media Synced','Post Types','Review Boosted','Tested','Training')),
  outcome text check (outcome in ('completed','not_acquired')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, setup_type)
);
alter table public.daily_task_onboarding_qc enable row level security;
grant select, insert, update on public.daily_task_onboarding_qc to authenticated;
revoke delete on public.daily_task_onboarding_qc from authenticated;
drop policy if exists "task owners and managers read QC" on public.daily_task_onboarding_qc;
create policy "task owners and managers read QC" on public.daily_task_onboarding_qc for select to authenticated using (exists (select 1 from public.daily_tasks t where t.id = task_id and (t.owner_id = auth.uid() or public.is_manager())));
drop policy if exists "task owners and managers insert QC" on public.daily_task_onboarding_qc;
create policy "task owners and managers insert QC" on public.daily_task_onboarding_qc for insert to authenticated with check (updated_by = auth.uid() and exists (select 1 from public.daily_tasks t where t.id = task_id and (t.owner_id = auth.uid() or public.is_manager())));
drop policy if exists "task owners and managers update QC" on public.daily_task_onboarding_qc;
create policy "task owners and managers update QC" on public.daily_task_onboarding_qc for update to authenticated using (exists (select 1 from public.daily_tasks t where t.id = task_id and (t.owner_id = auth.uid() or public.is_manager()))) with check (updated_by = auth.uid() and exists (select 1 from public.daily_tasks t where t.id = task_id and (t.owner_id = auth.uid() or public.is_manager())));

create or replace function public.guard_onboarding_qc()
returns trigger language plpgsql set search_path = '' as $$
declare v_task public.daily_tasks%rowtype;
begin
  -- Serialize checklist writes with completion and transfers on the parent row.
  if tg_op = 'UPDATE' and (new.task_id <> old.task_id or new.setup_type <> old.setup_type) then raise exception 'QC identity cannot be changed'; end if;
  select * into v_task from public.daily_tasks where id = new.task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.category = 'Onboarding' and v_task.status = 'completed' and new.outcome is null then
    raise exception 'Reopen the task before clearing a QC outcome';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_onboarding_qc on public.daily_task_onboarding_qc;
create trigger guard_onboarding_qc before insert or update on public.daily_task_onboarding_qc for each row execute function public.guard_onboarding_qc();
create or replace function public.validate_onboarding_completion()
returns trigger language plpgsql set search_path = '' as $$
declare v_reviewed integer;
begin
  -- Preserve pre-existing completed rows on unrelated edits. Reopening then
  -- completing, or changing a completed task to Onboarding, requires QC.
  if new.category = 'Onboarding' and new.status = 'completed' then
    if tg_op = 'UPDATE' then
      if old.status = 'completed' and old.category = 'Onboarding' then return new; end if;
    end if;
    select count(*) into v_reviewed from public.daily_task_onboarding_qc where task_id = new.id and outcome in ('completed','not_acquired');
    if v_reviewed <> 17 then
      raise exception 'Please complete the Onboarding QC checklist before marking this task as Completed. % setup types outstanding.', 17-v_reviewed using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_onboarding_completion on public.daily_tasks;
create trigger validate_onboarding_completion before insert or update on public.daily_tasks for each row execute function public.validate_onboarding_completion();

-- Invoker security preserves existing task RLS. Task + QC save is atomic.
create or replace function public.save_daily_task_with_qc(p_task_id uuid, p_fields jsonb, p_owner_id uuid, p_qc jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_task public.daily_tasks%rowtype; v_entry record; v_new boolean := p_task_id is null;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_qc) <> 'object' or p_qc is null then raise exception 'QC must be an object'; end if;
  if v_new then
    insert into public.daily_tasks(owner_id, title, category, task_date, status, created_by, updated_by, timer_started_at)
      values(p_owner_id, p_fields->>'title', p_fields->>'category', (p_fields->>'task_date')::date, 'todo', auth.uid(), auth.uid(), now()) returning * into v_task;
  else
    select * into v_task from public.daily_tasks where id = p_task_id for update;
    if not found then raise exception 'Task not found or access denied' using errcode = '42501'; end if;
  end if;
  for v_entry in select key, value from jsonb_each_text(p_qc) loop
    insert into public.daily_task_onboarding_qc(task_id, setup_type, outcome, updated_by)
      values(v_task.id, v_entry.key, v_entry.value, auth.uid())
      on conflict(task_id, setup_type) do update set outcome = excluded.outcome, updated_by = auth.uid();
  end loop;
  update public.daily_tasks set title = p_fields->>'title', description = p_fields->>'description', notes = p_fields->>'notes',
    category = p_fields->>'category', task_date = (p_fields->>'task_date')::date, status = p_fields->>'status',
    wip_tag = p_fields->>'wip_tag', action_taken = p_fields->>'action_taken', completion_comment = p_fields->>'completion_comment',
    completed_at = case when p_fields->>'status' = 'completed' then case when v_task.status = 'completed' then coalesce(v_task.completed_at, now()) else now() end else null end,
    timer_started_at = case when v_task.status = 'completed' and p_fields->>'status' <> 'completed' then now() else v_task.timer_started_at end,
    moved_to_wip_at = case when p_fields->>'status' = 'wip' and v_task.status <> 'wip' then now() else v_task.moved_to_wip_at end,
    updated_by = auth.uid()
    where id = v_task.id returning * into v_task;
  if not found then raise exception 'Task save denied' using errcode = '42501'; end if;
  return to_jsonb(v_task);
end $$;
revoke all on function public.save_daily_task_with_qc(uuid,jsonb,uuid,jsonb) from public;
grant execute on function public.save_daily_task_with_qc(uuid,jsonb,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
