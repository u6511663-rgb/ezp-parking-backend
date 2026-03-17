# EZP Supabase Schema Overview

```mermaid
erDiagram
  auth_users ||--|| profiles : has
  auth_users ||--o{ vehicle_registrations : owns
  auth_users ||--o{ bookings : creates
  parking_floors ||--o{ parking_slots : contains
  vehicle_registrations ||--o{ bookings : used_for
  parking_slots ||--o{ bookings : reserved_by
  parking_slots ||--o{ parking_events : logs

  profiles {
    uuid id PK
    text full_name
    timestamptz created_at
  }

  parking_floors {
    bigint id PK
    text code
    text name
    timestamptz created_at
  }

  parking_slots {
    bigint id PK
    bigint floor_id FK
    text code
    int slot_number
    boolean is_reservable
    boolean is_active
    timestamptz created_at
  }

  vehicle_registrations {
    uuid id PK
    uuid user_id FK
    text plate_number
    boolean is_default
    timestamptz created_at
  }

  bookings {
    uuid id PK
    uuid user_id FK
    uuid vehicle_id FK
    bigint slot_id FK
    timestamptz start_time
    timestamptz end_time
    booking_status status
    timestamptz created_at
  }

  parking_events {
    bigint id PK
    bigint slot_id FK
    text event_type
    text event_status
    timestamptz created_at
  }
```

## Register flow

1. User signs up with Supabase Auth.
2. `profiles` row is created automatically by trigger.
3. Car plates are saved to `vehicle_registrations`.
4. Optional slot booking is created in `bookings` through `create_booking(...)`.
5. `create_booking(...)` blocks overlapping reservations for the same slot and time range.
