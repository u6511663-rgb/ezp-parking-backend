-- Supabase schema for EZP Smart Parking (2nd phase)
-- Focus: 2 floors, 3 slots each, reservations on upper floor, ESP32 occupancy, Supabase Auth.

-- ============================
-- Extensions
-- ============================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ============================
-- Enum types
-- ============================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'reservation_status') then
    create type reservation_status as enum ('booked', 'checked_in', 'expired');
  end if;
end$$;

-- ============================
-- Plates
-- ============================

create table if not exists public.plates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plate_number text not null,
  created_at timestamptz not null default now(),
  unique (user_id, plate_number)
);

-- ============================
-- Slots (2 floors x 3 slots)
-- ============================

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  floor text not null check (floor in ('GND', 'UPP')),
  position text not null check (position in ('LEFT', 'MIDDLE', 'RIGHT')),
  is_reservable boolean not null default false, -- true for UPP only
  created_at timestamptz not null default now(),
  unique (floor, position)
);

-- Seed the 2x3 layout
insert into public.slots (floor, position, is_reservable)
values
  ('GND','LEFT',   false),
  ('GND','MIDDLE', false),
  ('GND','RIGHT',  false),
  ('UPP','LEFT',   true),
  ('UPP','MIDDLE', true),
  ('UPP','RIGHT',  true)
on conflict (floor, position) do nothing;

-- ============================
-- Reservations
-- ============================

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plate_id uuid not null references public.plates(id) on delete cascade,
  slot_id uuid not null references public.slots(id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null,
  status reservation_status not null default 'booked',
  created_at timestamptz not null default now(),
  constraint chk_valid_time check (end_time > start_time)
);

-- ============================
-- Slot status (ESP32 occupancy)
-- ============================

create table if not exists public.slot_status (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete cascade,
  occupied boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (slot_id)
);

-- ============================
-- Overlapping reservation protection
-- ============================

alter table public.reservations
  drop constraint if exists reservations_no_overlap;

alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    slot_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status in ('booked','checked_in'));

-- ============================
-- RLS policies
-- ============================

alter table public.plates       enable row level security;
alter table public.reservations enable row level security;
alter table public.slots        enable row level security;
alter table public.slot_status  enable row level security;

-- Plates: users manage only their own plates
drop policy if exists "users_manage_own_plates" on public.plates;
create policy "users_manage_own_plates"
  on public.plates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reservations: users manage only their own reservations
drop policy if exists "users_manage_own_reservations" on public.reservations;
create policy "users_manage_own_reservations"
  on public.reservations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Slots and slot_status: public read, admin/service write
drop policy if exists "public_read_slots" on public.slots;
create policy "public_read_slots"
  on public.slots for select
  using (true);

drop policy if exists "public_read_slot_status" on public.slot_status;
create policy "public_read_slot_status"
  on public.slot_status for select
  using (true);

-- ============================
-- Helper: create_reservation()
--  - 30 minutes simulated as 3 real minutes
--  - Prevents booking non-reservable slots (e.g. GND)
--  - Raises SLOT_ALREADY_BOOKED on conflict
-- ============================

create or replace function public.create_reservation(
  p_user_id    uuid,
  p_plate_id   uuid,
  p_slot_id    uuid,
  p_start_time timestamptz
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.reservations;
  v_is_reservable boolean;
begin
  select is_reservable into v_is_reservable
  from public.slots
  where id = p_slot_id;

  if v_is_reservable is not true then
    raise exception 'SLOT_NOT_RESERVABLE' using errcode = 'P0001';
  end if;

  insert into public.reservations (user_id, plate_id, slot_id, start_time, end_time)
  values (
    p_user_id,
    p_plate_id,
    p_slot_id,
    p_start_time,
    p_start_time + interval '3 minutes'
  )
  returning * into v_res;

  return v_res;

exception
  when exclusion_violation then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
end;
$$;

-- ============================
-- Helper: validate_check_in()
--  - Checks owner, plate, time window, status
--  - Marks reservation as checked_in when valid
-- ============================

create or replace function public.validate_check_in(
  p_reservation_id uuid,
  p_user_id        uuid,
  p_plate_id       uuid
)
returns table (
  allowed boolean,
  reason  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations;
  now_ts timestamptz := now();
begin
  select * into r
  from public.reservations
  where id = p_reservation_id;

  if not found then
    return query select false, 'RESERVATION_NOT_FOUND';
    return;
  end if;

  if r.user_id <> p_user_id then
    return query select false, 'NOT_OWNER';
    return;
  end if;

  if r.plate_id <> p_plate_id then
    return query select false, 'PLATE_MISMATCH';
    return;
  end if;

  if now_ts < r.start_time or now_ts > r.end_time then
    return query select false, 'OUTSIDE_WINDOW';
    return;
  end if;

  if r.status <> 'booked' then
    return query select false, 'INVALID_STATUS';
    return;
  end if;

  update public.reservations
  set status = 'checked_in'
  where id = r.id;

  return query select true, 'ALLOW';
end;
$$;

