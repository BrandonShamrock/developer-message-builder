begin;
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_mode text not null default 'light' check (theme_mode in ('light','dark','system')),
  colour_theme text not null default 'blue' check (colour_theme in ('blue','teal','purple','green','amber')),
  font_size text not null default 'default' check (font_size in ('small','default','large','extra-large')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.touch_user_preferences() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists touch_user_preferences on public.user_preferences;
create trigger touch_user_preferences before update on public.user_preferences for each row execute function public.touch_user_preferences();
alter table public.user_preferences enable row level security;
grant select, insert, update on public.user_preferences to authenticated;
drop policy if exists "read own preferences" on public.user_preferences;
create policy "read own preferences" on public.user_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists "insert own preferences" on public.user_preferences;
create policy "insert own preferences" on public.user_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own preferences" on public.user_preferences;
create policy "update own preferences" on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
notify pgrst, 'reload schema';
commit;
