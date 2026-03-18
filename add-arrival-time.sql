-- Minimal SQL to add arrival_time only
-- Run this in Supabase SQL Editor

-- Add arrival_time column to existing guest_requests table
alter table public.guest_requests
add column if not exists arrival_time timestamptz;

-- Update the view to include arrival_time
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

-- Add comment
comment on column public.guest_requests.arrival_time is 'Expected arrival time selected by the guest';
