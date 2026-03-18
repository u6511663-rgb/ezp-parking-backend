-- EZP Smart Parking - Guest Request System Schema
-- Adds support for guest parking requests with Thai language support

-- Enable UUID extension if not already enabled
create extension if not exists "pgcrypto";

-- Request status enum for guest requests
do $$
begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum (
      'pending',      -- Waiting for admin approval
      'approved',     -- Approved, slot assigned
      'rejected',     -- Rejected by admin
      'checked_in',   -- Guest has checked in
      'completed',    -- Guest has checked out
      'cancelled'     -- Guest cancelled or expired
    );
  end if;
end
$$;

-- Guest requests table
-- Stores temporary parking requests from guests (no account required)
create table if not exists public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  license_plate text not null,
  phone text,
  arrival_time timestamptz not null,  -- When guest plans to arrive
  status public.request_status not null default 'pending',

  -- Optional slot assignment (set when approved)
  assigned_slot_id bigint references public.parking_slots(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,

  -- Request timing
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  expires_at timestamptz,  -- Auto-expire pending requests

  -- Additional info
  notes text,  -- Admin notes
  rejection_reason text,

  -- Constraints
  constraint guest_name_length check (char_length(trim(full_name)) >= 2),
  constraint guest_plate_length check (char_length(trim(license_plate)) >= 3),
  constraint guest_phone_format check (phone is null or char_length(trim(phone)) >= 9)
);

-- Indexes for performance
create index if not exists idx_guest_requests_status
  on public.guest_requests(status);

create index if not exists idx_guest_requests_phone
  on public.guest_requests(phone);

create index if not exists idx_guest_requests_license_plate
  on public.guest_requests(license_plate);

create index if not exists idx_guest_requests_requested_at
  on public.guest_requests(requested_at desc);

create index if not exists idx_guest_requests_expires_at
  on public.guest_requests(expires_at)
  where status = 'pending';

-- Enable RLS
alter table public.guest_requests enable row level security;

-- RLS Policies

-- Allow anyone to create guest requests (anonymous access for guests)
drop policy if exists "allow_insert_guest_requests" on public.guest_requests;
create policy "allow_insert_guest_requests"
  on public.guest_requests
  for insert
  with check (true);

-- Allow guests to view their own requests by ID (using a token or direct ID)
-- Note: In practice, guests will use the API with their request ID
drop policy if exists "allow_select_own_guest_request" on public.guest_requests;
create policy "allow_select_own_guest_request"
  on public.guest_requests
  for select
  using (true);  -- Simplified: guests use unique UUID to access

-- Only authenticated users (admins) can update/delete
drop policy if exists "authenticated_manage_guest_requests" on public.guest_requests;
create policy "authenticated_manage_guest_requests"
  on public.guest_requests
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Function to auto-expire old pending requests
create or replace function public.expire_old_guest_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_requests
  set status = 'cancelled',
      notes = coalesce(notes, '') || ' [Auto-expired after 24 hours]'
  where status = 'pending'
    and requested_at < now() - interval '24 hours';
end;
$$;

-- Function to approve a guest request and assign slot
create or replace function public.approve_guest_request(
  p_request_id uuid,
  p_slot_id bigint,
  p_admin_id uuid,
  p_notes text default null
)
returns public.guest_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guest_requests;
  v_slot_available boolean;
begin
  -- Check if request exists and is pending
  select * into v_request
  from public.guest_requests
  where id = p_request_id and status = 'pending';

  if v_request is null then
    raise exception 'REQUEST_NOT_FOUND_OR_NOT_PENDING' using errcode = 'P0001';
  end if;

  -- Check if slot is available
  select (is_reservable and is_active) into v_slot_available
  from public.parking_slots
  where id = p_slot_id;

  if not v_slot_available then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Update request
  update public.guest_requests
  set status = 'approved',
      assigned_slot_id = p_slot_id,
      assigned_by = p_admin_id,
      approved_at = now(),
      expires_at = now() + interval '2 hours',  -- Approved requests expire in 2 hours
      notes = coalesce(notes, '') || coalesce(' | ' || p_notes, '')
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

-- Function to check in a guest
create or replace function public.checkin_guest_request(p_request_id uuid)
returns public.guest_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guest_requests;
begin
  update public.guest_requests
  set status = 'checked_in',
      checked_in_at = now()
  where id = p_request_id
    and status = 'approved'
    and expires_at > now()
  returning * into v_request;

  if v_request is null then
    raise exception 'REQUEST_NOT_APPROVED_OR_EXPIRED' using errcode = 'P0001';
  end if;

  -- Log event
  insert into public.parking_events (slot_id, event_type, event_status)
  values (v_request.assigned_slot_id, 'enter', 'guest_checkin');

  return v_request;
end;
$$;

-- Function to check out a guest
create or replace function public.checkout_guest_request(p_request_id uuid)
returns public.guest_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guest_requests;
begin
  update public.guest_requests
  set status = 'completed',
      checked_out_at = now()
  where id = p_request_id
    and status = 'checked_in'
  returning * into v_request;

  if v_request is null then
    raise exception 'REQUEST_NOT_CHECKED_IN' using errcode = 'P0001';
  end if;

  -- Free up the slot
  -- Note: parking_slots doesn't have a status column, slots are managed via bookings

  -- Log event
  insert into public.parking_events (slot_id, event_type, event_status)
  values (v_request.assigned_slot_id, 'exit', 'guest_checkout');

  return v_request;
end;
$$;

-- Grant execute permissions
grant execute on function public.approve_guest_request(uuid, bigint, uuid, text) to authenticated;
grant execute on function public.checkin_guest_request(uuid) to authenticated;
grant execute on function public.checkout_guest_request(uuid) to authenticated;

-- View for guest request overview with slot details
create or replace view public.guest_request_overview as
select
  gr.id,
  gr.full_name,
  gr.license_plate,
  gr.phone,
  gr.arrival_time,
  gr.status,
  gr.requested_at,
  gr.approved_at,
  gr.checked_in_at,
  gr.checked_out_at,
  gr.expires_at,
  gr.notes,
  gr.rejection_reason,
  ps.code as slot_code,
  ps.slot_number,
  pf.code as floor_code,
  pf.name as floor_name,
  au.email as assigned_by_email
from public.guest_requests gr
left join public.parking_slots ps on ps.id = gr.assigned_slot_id
left join public.parking_floors pf on pf.id = ps.floor_id
left join auth.users au on au.id = gr.assigned_by;

-- Comments for documentation
comment on table public.guest_requests is 'Stores temporary parking requests from guests without registered accounts';
comment on column public.guest_requests.full_name is 'Guest full name, supports Thai Unicode characters';
comment on column public.guest_requests.license_plate is 'Vehicle license plate, supports Thai characters';
comment on column public.guest_requests.phone is 'Contact phone number for notifications';
comment on column public.guest_requests.arrival_time is 'Expected arrival time selected by the guest';
comment on column public.guest_requests.expires_at is 'Auto-expiration time for approved requests (2 hours default)';
