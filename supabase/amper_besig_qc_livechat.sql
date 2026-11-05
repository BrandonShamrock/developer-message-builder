-- Incremental update: run after amper_besig_ticket_categories_qc.sql.
-- Coordinate with the 18-item frontend. Existing data and RLS are unchanged.
begin;
alter table public.daily_task_onboarding_qc drop constraint if exists daily_task_onboarding_qc_setup_type_check;
alter table public.daily_task_onboarding_qc add constraint daily_task_onboarding_qc_setup_type_check
  check (setup_type in ('PostX Organisation','Subgroups','Members','SLA','Quick Replies','Open Hours','WABAs','Routing','LiveChat','Automated Replies','Integration','Conexa','AI','Social Media Synced','Post Types','Review Boosted','Tested','Training'));
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
    if v_reviewed <> 18 then
      raise exception 'Please complete the Onboarding QC checklist before marking this task as Completed. % setup types outstanding.', 18-v_reviewed using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
notify pgrst, 'reload schema';
commit;
