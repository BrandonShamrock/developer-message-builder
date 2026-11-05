-- Incremental update: run after amper_besig_quotes.sql, before the new frontend.
-- No backfill/default: NULL VAT fields explicitly identify historical quotations.
begin;
alter table public.crm_quotes
  add column if not exists vat_rate numeric(7,4),
  add column if not exists setup_vat numeric(13,2),
  add column if not exists monthly_vat numeric(13,2),
  add column if not exists setup_total_including_vat numeric(14,2),
  add column if not exists monthly_total_including_vat numeric(14,2);
alter table public.crm_quotes drop constraint if exists crm_quotes_vat_snapshot_check;
alter table public.crm_quotes add constraint crm_quotes_vat_snapshot_check check (
  (vat_rate is null and setup_vat is null and monthly_vat is null and setup_total_including_vat is null and monthly_total_including_vat is null)
  or
  (vat_rate is not null and setup_vat is not null and monthly_vat is not null and setup_total_including_vat is not null and monthly_total_including_vat is not null
   and vat_rate between 0 and 100 and setup_vat >= 0 and monthly_vat >= 0
   and setup_vat = round(setup_total * vat_rate / 100, 2)
   and monthly_vat = round(monthly_total * vat_rate / 100, 2)
   and setup_total_including_vat = setup_total + setup_vat
   and monthly_total_including_vat = monthly_total + monthly_vat)
);
-- Single authoritative server rate for future saves. Match src/money.js VAT_RATE.
-- Rate changes affect explicit draft saves/new quotes, never historical previews.
create or replace function public.crm_quote_vat_rate()
returns numeric language sql immutable set search_path = '' as $$ select 15.0000::numeric $$;
create or replace function public.save_crm_quote(p_quote_id uuid, p_client_id uuid, p_items jsonb, p_notes text, p_refresh_client boolean default false, p_status text default 'draft', p_expected_discount numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.crm_quotes%rowtype; v_client public.crm_clients%rowtype; v_group public.crm_groups%rowtype;
  v_product public.crm_products%rowtype; v_old public.crm_quote_items%rowtype;
  v_item jsonb; v_items jsonb := '[]'; v_snapshot jsonb; v_discount numeric;
  v_qty numeric; v_setup numeric; v_monthly numeric; v_setup_sum numeric := 0; v_monthly_sum numeric := 0;
  v_vat_rate numeric := public.crm_quote_vat_rate();
  v_setup_total numeric; v_monthly_total numeric; v_setup_vat numeric; v_monthly_vat numeric;
  v_id uuid; v_position integer := 0; v_seen uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('draft','issued') then raise exception 'Invalid quote status'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Select at least one product'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 then raise exception 'Select between 1 and 200 products'; end if;
  if p_quote_id is not null then
    select * into v_quote from public.crm_quotes where id = p_quote_id for update;
    if not found then raise exception 'Quotation not found'; end if;
    if v_quote.status <> 'draft' then raise exception 'Only draft quotations may be edited'; end if;
  end if;
  if p_quote_id is null or p_refresh_client or p_client_id is distinct from v_quote.crm_client_id then
    select * into v_client from public.crm_clients where id = p_client_id;
    if not found then raise exception 'Select an existing CRM client'; end if;
    select * into v_group from public.crm_groups where id = v_client.group_id;
    v_discount := round(coalesce(v_group.discount_percentage, v_client.group_discount_percentage, 0), 4);
    v_snapshot := jsonb_build_object('business_name', v_client.business_name, 'business_address', coalesce(v_client.business_address,''), 'contact_name', v_client.contact_name, 'contact_email', v_client.contact_email, 'group_name', coalesce(v_group.name,v_client.group_name,''));
  else
    v_discount := v_quote.discount_percentage; v_snapshot := v_quote.client_snapshot;
  end if;
  if p_expected_discount is null or v_discount <> p_expected_discount then raise exception 'Client discount changed. Reselect the CRM client and review the totals.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999999.999 or v_qty <> round(v_qty,3) then raise exception 'Quantity must be positive with at most three decimal places'; end if;
    if nullif(v_item->>'id','') is not null then
      select * into v_old from public.crm_quote_items where id = (v_item->>'id')::uuid and quote_id = p_quote_id;
      if not found then raise exception 'Quote line not found'; end if;
      if v_old.id = any(v_seen) then raise exception 'Duplicate quote line'; end if;
      v_seen := array_append(v_seen,v_old.id);
      -- Existing draft lines retain their original price and description snapshots.
      v_product.id := v_old.product_id; v_product.name := v_old.product_name; v_product.description := v_old.product_description;
      v_product.setup_cost := v_old.setup_unit_cost; v_product.monthly_cost := v_old.monthly_unit_cost;
    else
      select * into v_product from public.crm_products where id = (v_item->>'product_id')::uuid and is_active;
      if not found then raise exception 'Product is unavailable or archived'; end if;
      -- Reject stale catalogue pricing rather than silently saving different totals.
      if (v_item->>'setup_unit_cost')::numeric is distinct from v_product.setup_cost or (v_item->>'monthly_unit_cost')::numeric is distinct from v_product.monthly_cost then
        raise exception 'Product pricing changed. Reload the catalogue and add the product again.';
      end if;
    end if;
    v_setup := round(v_product.setup_cost * v_qty,2); v_monthly := round(v_product.monthly_cost * v_qty,2);
    v_setup_sum := v_setup_sum + v_setup; v_monthly_sum := v_monthly_sum + v_monthly;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'product_description',v_product.description,'quantity',v_qty,'setup_unit_cost',v_product.setup_cost,'monthly_unit_cost',v_product.monthly_cost,'setup_line_total',v_setup,'monthly_line_total',v_monthly,'position',v_position));
  end loop;
  -- Round each discount before applying VAT to the discounted amount.
  v_setup_total := v_setup_sum - round(v_setup_sum*v_discount/100,2);
  v_monthly_total := v_monthly_sum - round(v_monthly_sum*v_discount/100,2);
  v_setup_vat := round(v_setup_total*v_vat_rate/100,2);
  v_monthly_vat := round(v_monthly_total*v_vat_rate/100,2);
  if p_quote_id is null then
    insert into public.crm_quotes(crm_client_id,client_snapshot,discount_percentage,setup_subtotal,setup_discount,setup_total,monthly_subtotal,monthly_discount,monthly_total,vat_rate,setup_vat,monthly_vat,setup_total_including_vat,monthly_total_including_vat,notes,status,created_by,updated_by)
      values(p_client_id,v_snapshot,v_discount,v_setup_sum,round(v_setup_sum*v_discount/100,2),v_setup_sum-round(v_setup_sum*v_discount/100,2),v_monthly_sum,round(v_monthly_sum*v_discount/100,2),v_monthly_total,v_vat_rate,v_setup_vat,v_monthly_vat,v_setup_total+v_setup_vat,v_monthly_total+v_monthly_vat,coalesce(p_notes,''),p_status,auth.uid(),auth.uid()) returning * into v_quote;
  else
    update public.crm_quotes set crm_client_id=p_client_id,client_snapshot=v_snapshot,discount_percentage=v_discount,
      setup_subtotal=v_setup_sum,setup_discount=round(v_setup_sum*v_discount/100,2),setup_total=v_setup_sum-round(v_setup_sum*v_discount/100,2),
      monthly_subtotal=v_monthly_sum,monthly_discount=round(v_monthly_sum*v_discount/100,2),monthly_total=v_monthly_sum-round(v_monthly_sum*v_discount/100,2),
      vat_rate=v_vat_rate,setup_vat=v_setup_vat,monthly_vat=v_monthly_vat,
      setup_total_including_vat=v_setup_total+v_setup_vat,monthly_total_including_vat=v_monthly_total+v_monthly_vat,
      notes=coalesce(p_notes,''),status=p_status,updated_by=auth.uid(),updated_at=now() where id=p_quote_id returning * into v_quote;
    delete from public.crm_quote_items where quote_id=p_quote_id;
  end if;
  insert into public.crm_quote_items(quote_id,product_id,product_name,product_description,quantity,setup_unit_cost,monthly_unit_cost,setup_line_total,monthly_line_total,position)
    select v_quote.id,x.product_id,x.product_name,x.product_description,x.quantity,x.setup_unit_cost,x.monthly_unit_cost,x.setup_line_total,x.monthly_line_total,x.position
    from jsonb_to_recordset(v_items) as x(product_id uuid,product_name text,product_description text,quantity numeric,setup_unit_cost numeric,monthly_unit_cost numeric,setup_line_total numeric,monthly_line_total numeric,position integer);
  return to_jsonb(v_quote) || jsonb_build_object('crm_quote_items',(select jsonb_agg(to_jsonb(i) order by i.position) from public.crm_quote_items i where i.quote_id=v_quote.id));
end $$;
revoke all on function public.save_crm_quote(uuid,uuid,jsonb,text,boolean,text,numeric) from public;
grant execute on function public.save_crm_quote(uuid,uuid,jsonb,text,boolean,text,numeric) to authenticated;
notify pgrst, 'reload schema';
commit;
