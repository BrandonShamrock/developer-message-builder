-- Prerequisites: crm_schema.sql and amper_besig_products.sql.
begin;
create sequence if not exists public.crm_quote_number_seq;
create table if not exists public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique default ('AB-' || to_char(now(), 'YYYY') || '-' || nextval('public.crm_quote_number_seq')::text),
  crm_client_id uuid references public.crm_clients(id) on delete set null,
  client_snapshot jsonb not null,
  discount_percentage numeric(7,4) not null check (discount_percentage between 0 and 100),
  setup_subtotal numeric(13,2) not null check (setup_subtotal >= 0), setup_discount numeric(13,2) not null check (setup_discount >= 0), setup_total numeric(13,2) not null check (setup_total >= 0),
  monthly_subtotal numeric(13,2) not null check (monthly_subtotal >= 0), monthly_discount numeric(13,2) not null check (monthly_discount >= 0), monthly_total numeric(13,2) not null check (monthly_total >= 0),
  notes text not null default '', status text not null default 'draft' check (status in ('draft','issued')),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (setup_total = setup_subtotal - setup_discount and monthly_total = monthly_subtotal - monthly_discount)
);
create table if not exists public.crm_quote_items (
  id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  product_id uuid references public.crm_products(id) on delete restrict,
  product_name text not null, product_description text not null default '',
  quantity numeric(9,3) not null check (quantity > 0 and quantity <= 999999.999),
  setup_unit_cost numeric(11,2) not null check (setup_unit_cost >= 0), monthly_unit_cost numeric(11,2) not null check (monthly_unit_cost >= 0),
  setup_line_total numeric(13,2) not null check (setup_line_total >= 0), monthly_line_total numeric(13,2) not null check (monthly_line_total >= 0),
  position integer not null, created_at timestamptz not null default now()
);
create index if not exists crm_quotes_created_idx on public.crm_quotes(created_at desc);
create index if not exists crm_quotes_client_idx on public.crm_quotes(crm_client_id);
create index if not exists crm_quote_items_quote_idx on public.crm_quote_items(quote_id, position);
create index if not exists crm_quote_items_product_idx on public.crm_quote_items(product_id);
alter table public.crm_quotes enable row level security;
alter table public.crm_quote_items enable row level security;
-- All team writes go through the constrained atomic RPC; no direct writes.
revoke all on public.crm_quotes, public.crm_quote_items from anon, authenticated;
grant select on public.crm_quotes, public.crm_quote_items to authenticated;
drop policy if exists "team reads quotes" on public.crm_quotes;
create policy "team reads quotes" on public.crm_quotes for select to authenticated using (true);
drop policy if exists "team reads quote items" on public.crm_quote_items;
create policy "team reads quote items" on public.crm_quote_items for select to authenticated using (true);

create or replace function public.save_crm_quote(p_quote_id uuid, p_client_id uuid, p_items jsonb, p_notes text, p_refresh_client boolean default false, p_status text default 'draft', p_expected_discount numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.crm_quotes%rowtype; v_client public.crm_clients%rowtype; v_group public.crm_groups%rowtype;
  v_product public.crm_products%rowtype; v_old public.crm_quote_items%rowtype;
  v_item jsonb; v_items jsonb := '[]'; v_snapshot jsonb; v_discount numeric;
  v_qty numeric; v_setup numeric; v_monthly numeric; v_setup_sum numeric := 0; v_monthly_sum numeric := 0;
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
  if p_quote_id is null then
    insert into public.crm_quotes(crm_client_id,client_snapshot,discount_percentage,setup_subtotal,setup_discount,setup_total,monthly_subtotal,monthly_discount,monthly_total,notes,status,created_by,updated_by)
      values(p_client_id,v_snapshot,v_discount,v_setup_sum,round(v_setup_sum*v_discount/100,2),v_setup_sum-round(v_setup_sum*v_discount/100,2),v_monthly_sum,round(v_monthly_sum*v_discount/100,2),v_monthly_sum-round(v_monthly_sum*v_discount/100,2),coalesce(p_notes,''),p_status,auth.uid(),auth.uid()) returning * into v_quote;
  else
    update public.crm_quotes set crm_client_id=p_client_id,client_snapshot=v_snapshot,discount_percentage=v_discount,
      setup_subtotal=v_setup_sum,setup_discount=round(v_setup_sum*v_discount/100,2),setup_total=v_setup_sum-round(v_setup_sum*v_discount/100,2),
      monthly_subtotal=v_monthly_sum,monthly_discount=round(v_monthly_sum*v_discount/100,2),monthly_total=v_monthly_sum-round(v_monthly_sum*v_discount/100,2),
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
