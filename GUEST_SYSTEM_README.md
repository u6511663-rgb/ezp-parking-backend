# EZP Parking - Guest Login System Implementation

## Overview
This implementation adds a complete guest login and request system to the EZP Parking application, allowing guests to request parking without registering an account. The system supports Thai language for names and license plates.

## Files Created/Modified

### 1. Database Schema (`supabase-schema-guest-requests.sql`)
**New file** - Contains SQL to create:
- `guest_requests` table with fields:
  - `id` (UUID) - Request identifier
  - `full_name` (text) - Guest name (supports Thai)
  - `license_plate` (text) - License plate (supports Thai)
  - `phone` (text) - Contact number
  - `status` (enum) - pending, approved, rejected, checked_in, completed, cancelled
  - `assigned_slot_id` - Linked parking slot
  - Timestamps for tracking
- Functions:
  - `approve_guest_request()` - Approve and assign slot
  - `checkin_guest_request()` - Check in guest
  - `checkout_guest_request()` - Check out guest
  - `expire_old_guest_requests()` - Auto-expire old requests
- RLS policies for security

### 2. Backend API (`server.js`)
**Modified** - Added endpoints:
- `POST /api/guest/request` - Create new guest request
- `GET /api/guest/request/:id` - Get request status
- `POST /api/guest/request/:id/cancel` - Cancel request
- `GET /api/guest/requests` - List all requests (admin)
- `POST /api/guest/request/:id/approve` - Approve request (admin)
- `POST /api/guest/request/:id/reject` - Reject request (admin)
- `POST /api/guest/request/:id/checkin` - Check in guest (admin)
- `POST /api/guest/request/:id/checkout` - Check out guest (admin)

### 3. Authentication Page (`auth.html`)
**Replaced** - New dual-mode login page:
- **Guest Mode**: Simple form for name, license plate, phone
  - Supports Thai Unicode characters
  - Shows request status after submission
  - Saves request ID to localStorage
- **Registered User Mode**: Login/Register tabs
  - Login with email/password
  - Register with name, email, password, optional license plate
  - Integrates with Supabase Auth

### 4. Guest Status Page (`guest-status.html`)
**New file** - Allows guests to check their request status:
- Search by Request ID
- Real-time status display with visual timeline
- Shows assigned parking slot when approved
- QR code generation for approved requests
- Auto-refresh every 10 seconds
- Cancel pending requests

### 5. Admin Management Page (`admin-requests.html`)
**New file** - Admin interface for managing requests:
- Statistics dashboard (pending, approved, checked in counts)
- Filter by status
- Search by name, license plate, or phone
- Actions:
  - Approve with slot selection
  - Reject with reason
  - Check in/out
  - View full details
- Auto-refresh every 30 seconds

### 6. Home Page (`home.html`)
**Modified** - Added quick action buttons:
- "Request Parking" - Links to auth.html
- "Check Status" - Links to guest-status.html

## Features

### For Guests:
1. **No registration required** - Just enter name and license plate
2. **Thai language support** - Full Unicode support for Thai names and license plates
3. **Real-time status tracking** - See request status updates automatically
4. **QR code** - Show QR code to staff for quick verification
5. **Mobile-friendly** - Responsive design for all devices

### For Admins:
1. **Request management** - View all requests with filtering
2. **Slot assignment** - Visual slot selector when approving
3. **Check in/out** - Track guest parking lifecycle
4. **Statistics** - Quick overview of current status

## Database Schema Details

### guest_requests Table
```sql
- id: uuid (primary key)
- full_name: text (not null, min 2 chars)
- license_plate: text (not null, min 3 chars)
- phone: text (optional, min 9 chars)
- status: request_status enum
- assigned_slot_id: bigint (foreign key)
- assigned_by: uuid (foreign key)
- requested_at: timestamptz
- approved_at: timestamptz
- checked_in_at: timestamptz
- checked_out_at: timestamptz
- expires_at: timestamptz
- notes: text
- rejection_reason: text
```

### Request Status Flow
```
pending → approved → checked_in → completed
   ↓           ↓
rejected   cancelled
```

## Setup Instructions

1. **Run the database schema**:
   ```bash
   psql -f supabase-schema-guest-requests.sql
   ```

2. **Restart the server**:
   ```bash
   npm start
   ```

3. **Access the application**:
   - Home: `http://localhost:3000/home.html`
   - Login: `http://localhost:3000/auth.html`
   - Guest Status: `http://localhost:3000/guest-status.html`
   - Admin: `http://localhost:3000/admin-requests.html`

## API Response Examples

### Create Guest Request
```json
POST /api/guest/request
{
  "full_name": "สมชาย ใจดี",
  "license_plate": "กก 1234 กรุงเทพ",
  "phone": "0812345678"
}

Response:
{
  "success": true,
  "message": "Request submitted successfully",
  "request": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "full_name": "สมชาย ใจดี",
    "license_plate": "กก 1234 กรุงเทพ",
    "status": "pending",
    "requested_at": "2024-01-15T10:30:00Z"
  }
}
```

### Get Request Status
```json
GET /api/guest/request/550e8400-e29b-41d4-a716-446655440000

Response:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "full_name": "สมชาย ใจดี",
  "license_plate": "กก 1234 กรุงเทพ",
  "phone": "0812345678",
  "status": "approved",
  "slot": {
    "code": "F1-S01",
    "number": 1,
    "floor": "F1",
    "floor_name": "Floor 1"
  },
  "requested_at": "2024-01-15T10:30:00Z",
  "approved_at": "2024-01-15T10:35:00Z"
}
```

## Security Considerations

1. **RLS Policies** - Row Level Security ensures guests can only access their own data
2. **UUID-based access** - Request IDs are UUIDs, making them hard to guess
3. **Input validation** - Server-side validation for all inputs
4. **Rate limiting** - Consider adding rate limiting for guest requests in production
5. **Auto-expiration** - Pending requests expire after 24 hours, approved after 2 hours

## Future Enhancements

1. Email/SMS notifications when request is approved
2. Integration with LINE Notify for Thai users
3. Photo upload for license plate verification
4. Multiple vehicle support per guest
5. Recurring guest feature (faster re-checkin)
6. Analytics dashboard for parking patterns

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Notes

- The system uses `lang="th"` for proper Thai text rendering
- UTF-8 encoding is required for database and HTML files
- QR codes are generated using an external API (qrserver.com)
