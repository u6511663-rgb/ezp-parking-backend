-- Update guest_requests to auto-approve (no verification needed)
-- Run this in Supabase SQL Editor

-- Change default status to 'approved' so guests don't need to wait
alter table public.guest_requests
alter column status set default 'approved';

-- Update existing pending requests to approved
update public.guest_requests
set status = 'approved'
where status = 'pending';

-- Also update the server to set approved_at when creating
-- This is done in the application code
