# EZP Schema Based On Your Old Tables

This version keeps your original tables:

- `parking_floor1`
- `parking_floor2`

and adds:

- `profiles`
- `vehicle_registrations`
- `bookings`

## Diagram

```mermaid
erDiagram
  auth_users ||--|| profiles : creates
  auth_users ||--o{ vehicle_registrations : owns
  auth_users ||--o{ bookings : makes
  vehicle_registrations ||--o{ bookings : uses

  profiles {
    uuid id PK
    text email
    text full_name
    timestamptz created_at
  }

  vehicle_registrations {
    uuid id PK
    uuid user_id FK
    text plate_number
    timestamptz created_at
  }

  bookings {
    uuid id PK
    uuid user_id FK
    uuid vehicle_id FK
    int floor_no
    int slot
    timestamptz start_time
    timestamptz end_time
    text status
    timestamptz created_at
  }

  parking_floor1 {
    bigint id PK
    timestamptz created_at
    bigint slot
    text status
  }

  parking_floor2 {
    bigint id PK
    timestamptz created_at
    bigint slot
    text status
  }
```

## How It Works

1. User signs up with Supabase Auth.
2. Trigger stores that user in `profiles`.
3. User registers car plate in `vehicle_registrations`.
4. User books a slot and time in `bookings`.
5. Booking is allowed only on floor 2.
6. `parking_floor1` and `parking_floor2` keep sensor/live slot status history from your old design.
7. Barrier logic checks plate + slot + current time against `bookings`.

## Meaning Of Old Tables

- `parking_floor1`: live or history records for floor 1 slot status
- `parking_floor2`: live or history records for floor 2 slot status

These old tables do not store which user booked the slot.
That is why `bookings` is needed.

## Recommended Link Rule

Use this rule in your app:

- `bookings.floor_no = 1` means booking is for `parking_floor1`
- `bookings.floor_no = 2` means booking is for `parking_floor2`
- `bookings.slot` matches the `slot` column in those floor tables

## Barrier Rule

Only floor 2 bookings can open the barrier.

The camera/barrier should call:

- `validate_barrier_entry(plate_number, 2, slot, now())`

If the result returns:

- `allowed = true`
- `reason = 'ALLOW'`

then open the barrier.

## SQL File

Use this SQL file for the old-table version:

[supabase-schema-current-floors.sql](/C:/Users/saowa/Downloads/ezp-parking-backend-main/ezp-parking-backend-main/supabase-schema-current-floors.sql)
