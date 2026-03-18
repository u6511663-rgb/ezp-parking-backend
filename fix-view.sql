-- Recreate the guest_request_overview view
-- Run this in Supabase SQL Editor

drop view if exists public.guest_request_overview;

create view public.guest_request_overview as
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

-- Grant permissions
grant select on public.guest_request_overview to anon, authenticated;

-- Refresh the schema cache (important!)
notify pgrst, 'reload schema';
