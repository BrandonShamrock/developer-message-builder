begin;
create table if not exists public.crm_products (
  id uuid primary key default gen_random_uuid(), name text not null check (btrim(name) <> ''), description text not null default '',
  setup_cost numeric(11,2) not null default 0 check (setup_cost >= 0 and setup_cost <= 999999999.99),
  monthly_cost numeric(11,2) not null default 0 check (monthly_cost >= 0 and monthly_cost <= 999999999.99),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crm_products_name_idx on public.crm_products(lower(name));
create or replace function public.touch_crm_product() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists touch_crm_product on public.crm_products;
create trigger touch_crm_product before update on public.crm_products for each row execute function public.touch_crm_product();
alter table public.crm_products enable row level security;
grant select, insert, update on public.crm_products to authenticated;
-- Archive rather than grant DELETE; quote product references stay intact.
revoke delete on public.crm_products from authenticated;
drop policy if exists "team reads products" on public.crm_products;
create policy "team reads products" on public.crm_products for select to authenticated using (true);
drop policy if exists "team creates products" on public.crm_products;
create policy "team creates products" on public.crm_products for insert to authenticated with check (created_by = auth.uid() and updated_by = auth.uid());
drop policy if exists "team updates products" on public.crm_products;
create policy "team updates products" on public.crm_products for update to authenticated using (true) with check (updated_by = auth.uid());
notify pgrst, 'reload schema';
commit;
