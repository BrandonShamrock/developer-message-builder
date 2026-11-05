-- Incremental update: apply manually before the archiving frontend.
-- Requires the existing crm_quotes table; compatible with both quote save RPCs.
begin;
alter table public.crm_quotes add column if not exists is_archived boolean not null default false;

-- Also enforce restore-before-edit for old clients and concurrent/stale editors.
-- An archived record may only change its visibility flag, never its content.
create or replace function public.guard_archived_quote()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_archived and (new.is_archived or (to_jsonb(new) - 'is_archived') is distinct from (to_jsonb(old) - 'is_archived')) then
    raise exception 'Restore this quotation before editing.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists guard_archived_quote on public.crm_quotes;
create trigger guard_archived_quote before update on public.crm_quotes
  for each row execute function public.guard_archived_quote();

create or replace function public.set_crm_quote_archived(p_quote_id uuid, p_is_archived boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_quote public.crm_quotes%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_is_archived is null then raise exception 'Archive state is required' using errcode = '22004'; end if;
  -- Same authenticated-team scope as the existing quote read/save permissions.
  -- Explicit target state makes retries idempotent. Row locks serialize with saves.
  select * into v_quote from public.crm_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quotation not found' using errcode = 'P0002'; end if;
  if v_quote.is_archived is distinct from p_is_archived then
    update public.crm_quotes set is_archived = p_is_archived where id = p_quote_id;
  end if;
  return jsonb_build_object('id', v_quote.id, 'is_archived', p_is_archived);
end $$;
revoke all on function public.set_crm_quote_archived(uuid,boolean) from public;
grant execute on function public.set_crm_quote_archived(uuid,boolean) to authenticated;
-- No table UPDATE/DELETE grants or RLS policy changes.
notify pgrst, 'reload schema';
commit;
