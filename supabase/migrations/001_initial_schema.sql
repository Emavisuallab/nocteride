-- ============================================
-- NocteRide - Initial Schema Migration
-- ============================================

-- 1. PROFILES
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  role       text not null check (role in ('passenger', 'driver')),
  name       text not null,
  push_token text,
  created_at timestamptz default now()
);

-- 2. SERVICE_DAYS
create table public.service_days (
  id          uuid primary key default gen_random_uuid(),
  date        date unique,
  pickup_time time,
  status      text not null default 'scheduled'
                check (status in ('scheduled','negotiating','confirmed','in_progress','completed','cancelled')),
  amount      integer default 45000,
  is_paid     boolean default false,
  created_at  timestamptz default now()
);

-- 3. TIME_NEGOTIATIONS
create table public.time_negotiations (
  id             uuid primary key default gen_random_uuid(),
  service_day_id uuid references public.service_days on delete cascade,
  proposed_by    text not null,
  proposed_time  time not null,
  reason         text,
  status         text default 'pending'
                   check (status in ('pending','accepted','rejected')),
  created_at     timestamptz default now()
);

-- 4. TRACKING_SESSIONS
create table public.tracking_sessions (
  id             uuid primary key default gen_random_uuid(),
  service_day_id uuid references public.service_days on delete cascade,
  is_active      boolean default true,
  started_at     timestamptz default now(),
  ended_at       timestamptz
);

-- 5. LOCATION_UPDATES
create table public.location_updates (
  id                  uuid primary key default gen_random_uuid(),
  tracking_session_id uuid references public.tracking_sessions on delete cascade,
  lat                 float8 not null,
  lng                 float8 not null,
  recorded_at         timestamptz default now()
);

-- 6. PAYMENTS
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  service_day_id uuid references public.service_days on delete cascade,
  amount         integer not null,
  paid_at        timestamptz default now(),
  marked_by      uuid references public.profiles on delete set null
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.profiles          enable row level security;
alter table public.service_days      enable row level security;
alter table public.time_negotiations enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.location_updates  enable row level security;
alter table public.payments          enable row level security;

-- PROFILES: anyone authenticated can read, users update only their own
create policy "profiles_select" on public.profiles
  for select using (true);

create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- SERVICE_DAYS: authenticated read, insert, update
create policy "service_days_select" on public.service_days
  for select using (true);

create policy "service_days_insert" on public.service_days
  for insert with check (auth.role() = 'authenticated');

create policy "service_days_update" on public.service_days
  for update using (auth.role() = 'authenticated');

-- TIME_NEGOTIATIONS: authenticated read, insert, update
create policy "time_negotiations_select" on public.time_negotiations
  for select using (true);

create policy "time_negotiations_insert" on public.time_negotiations
  for insert with check (auth.role() = 'authenticated');

create policy "time_negotiations_update" on public.time_negotiations
  for update using (auth.role() = 'authenticated');

-- TRACKING_SESSIONS: authenticated read, insert, update
create policy "tracking_sessions_select" on public.tracking_sessions
  for select using (true);

create policy "tracking_sessions_insert" on public.tracking_sessions
  for insert with check (auth.role() = 'authenticated');

create policy "tracking_sessions_update" on public.tracking_sessions
  for update using (auth.role() = 'authenticated');

-- LOCATION_UPDATES: authenticated read, insert
create policy "location_updates_select" on public.location_updates
  for select using (true);

create policy "location_updates_insert" on public.location_updates
  for insert with check (auth.role() = 'authenticated');

-- PAYMENTS: authenticated read, insert
create policy "payments_select" on public.payments
  for select using (true);

create policy "payments_insert" on public.payments
  for insert with check (auth.role() = 'authenticated');

-- ============================================
-- REALTIME
-- ============================================

alter publication supabase_realtime add table location_updates;

-- ============================================
-- AUTO-CREATE PROFILE ON SIGN-UP
-- ============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name)
  values (
    new.id,
    'passenger',
    split_part(new.email, '@', 1)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
