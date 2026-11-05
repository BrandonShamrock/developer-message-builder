-- Run manually after amper_besig_quote_vat.sql, before the proposal frontend.
-- Nullable columns preserve existing quote history. The old save RPC stays compatible.
begin;
alter table public.crm_quotes
  add column if not exists service_overview text,
  add column if not exists valid_until date;

-- Compose the existing financial save with proposal metadata in ONE transaction.
-- Its locked draft check, auth, snapshots, VAT arithmetic and item writes remain authoritative.
create or replace function public.save_crm_quote_proposal(
  p_quote_id uuid, p_client_id uuid, p_items jsonb, p_notes text,
  p_refresh_client boolean default false, p_status text default 'draft',
  p_expected_discount numeric default null,
  p_service_overview text default null, p_valid_until date default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_saved jsonb;
  v_quote public.crm_quotes%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_valid_until is not null and not isfinite(p_valid_until) then raise exception 'Enter a finite expiry date'; end if;
  v_saved := public.save_crm_quote(p_quote_id, p_client_id, p_items, p_notes, p_refresh_client, p_status, p_expected_discount);
  -- save_crm_quote has already locked/validated the original draft. Newly issued
  -- quotes may receive metadata here, but an already-issued quote is rejected above.
  update public.crm_quotes
    set service_overview = nullif(btrim(p_service_overview), ''), valid_until = p_valid_until
    where id = (v_saved->>'id')::uuid returning * into v_quote;
  return to_jsonb(v_quote) || jsonb_build_object('crm_quote_items', v_saved->'crm_quote_items');
end $$;
revoke all on function public.save_crm_quote_proposal(uuid,uuid,jsonb,text,boolean,text,numeric,text,date) from public;
grant execute on function public.save_crm_quote_proposal(uuid,uuid,jsonb,text,boolean,text,numeric,text,date) to authenticated;
notify pgrst, 'reload schema';
commit;
