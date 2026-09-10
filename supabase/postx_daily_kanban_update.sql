-- PostX Daily Kanban update. Run this once in the Supabase SQL editor for an
-- existing installation. The statement is safe to run more than once.
alter table public.daily_tasks
add column if not exists wip_tag text;
