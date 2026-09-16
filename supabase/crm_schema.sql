-- CRM records are separate from public.clients and are structured for a future Quote Builder.
create extension if not exists pgcrypto;

create table if not exists public.crm_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  discount_percentage numeric not null default 0 check (discount_percentage >= 0 and discount_percentage <= 100),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.crm_groups(id) on delete set null,
  group_name text,
  business_name text not null check (btrim(business_name) <> ''),
  business_address text,
  contact_name text not null check (btrim(contact_name) <> ''),
  contact_email text not null check (btrim(contact_email) <> ''),
  group_discount_percentage numeric not null default 0 check (group_discount_percentage >= 0 and group_discount_percentage <= 100),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_clients_business_name_idx on public.crm_clients (business_name);
create index if not exists crm_clients_group_id_idx on public.crm_clients (group_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_crm_groups_updated_at on public.crm_groups;
create trigger set_crm_groups_updated_at before update on public.crm_groups for each row execute function public.set_updated_at();
drop trigger if exists set_crm_clients_updated_at on public.crm_clients;
create trigger set_crm_clients_updated_at before update on public.crm_clients for each row execute function public.set_updated_at();

alter table public.crm_groups enable row level security;
alter table public.crm_clients enable row level security;

drop policy if exists "authenticated users read CRM groups" on public.crm_groups;
create policy "authenticated users read CRM groups" on public.crm_groups for select to authenticated using (true);
drop policy if exists "authenticated users create CRM groups" on public.crm_groups;
create policy "authenticated users create CRM groups" on public.crm_groups for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "authenticated users update CRM groups" on public.crm_groups;
create policy "authenticated users update CRM groups" on public.crm_groups for update to authenticated using (true) with check (updated_by = auth.uid());

drop policy if exists "authenticated users read CRM clients" on public.crm_clients;
create policy "authenticated users read CRM clients" on public.crm_clients for select to authenticated using (true);
drop policy if exists "authenticated users create CRM clients" on public.crm_clients;
create policy "authenticated users create CRM clients" on public.crm_clients for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "authenticated users update CRM clients" on public.crm_clients;
create policy "authenticated users update CRM clients" on public.crm_clients for update to authenticated using (true) with check (updated_by = auth.uid());
drop policy if exists "authenticated users delete CRM clients" on public.crm_clients;
create policy "authenticated users delete CRM clients" on public.crm_clients for delete to authenticated using (true);
