-- SyncTune - Supabase schema
-- Chạy trong Supabase SQL Editor (một lần).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playlists_owner_idx on public.playlists (owner_id);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  from_name text,
  to_user uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('track', 'playlist')),
  payload jsonb not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shares_to_idx on public.shares (to_user);
create index if not exists shares_from_idx on public.shares (from_user);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.shares enable row level security;

-- profiles: mọi người đã đăng nhập đọc được (để chọn người nhận khi chia sẻ)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- playlists: chỉ chủ sở hữu
drop policy if exists playlists_all on public.playlists;
create policy playlists_all on public.playlists
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- shares: gửi cho chính mình; xem nếu là người gửi, người nhận, hoặc chia sẻ công khai
drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares
  for insert to authenticated with check (from_user = auth.uid());

drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or to_user is null);

drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares
  for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares
  for delete to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- ---------------------------------------------------------------------------
-- Tuỳ chọn: tự tạo profile khi có user mới
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: để app tự cập nhật khi có chia sẻ / playlist thay đổi
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlists'
  ) then
    alter publication supabase_realtime add table public.playlists;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shares'
  ) then
    alter publication supabase_realtime add table public.shares;
  end if;
end $$;
