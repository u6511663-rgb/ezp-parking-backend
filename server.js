const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();

loadEnvFile(path.join(__dirname, ".env"));

/* ==============================
   MIDDLEWARE
============================== */

app.use(cors());
app.use(express.json());

// Serve static files from root and public folder
app.use(express.static(__dirname));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Explicit routes for static files
app.get('/common.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'common.css'));
});
app.get('/booking-reminders.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'booking-reminders.js'));
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

/* ==============================
   SUPABASE INIT
============================== */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log("Supabase connected");

/* ==============================
   UTIL
============================== */

function getDayRange(day = "today") {
  const now = new Date();
  const thailand = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );

  if (day === "yesterday") {
    thailand.setDate(thailand.getDate() - 1);
  }

  thailand.setHours(0, 0, 0, 0);

  const start = new Date(thailand);
  const end = new Date(thailand);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const envLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of envLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function loadLatestFloorSlots(floorId) {
  const tableName = floorId === 2 ? "parking_floor2" : "parking_floor1";
  const { data, error } = await supabase
    .from(tableName)
    .select("id, slot, status, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const latestBySlot = new Map();
  (data || []).forEach((row) => {
    if (!latestBySlot.has(row.slot)) {
      latestBySlot.set(row.slot, row);
    }
  });

  return [1, 2, 3].map((slotNumber) => {
    const latest = latestBySlot.get(slotNumber);
    return {
      id: `${floorId}-${slotNumber}`,
      floor_id: floorId,
      slot: slotNumber,
      code: `F${floorId}-0${slotNumber}`,
      status: latest && latest.status === "occupied" ? "occupied" : "free",
      created_at: latest ? latest.created_at : null
    };
  });
}

/* ==============================
   HEALTH CHECK
============================== */

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/public-config", (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

/* ==============================
   ROOT
============================== */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

/* ==============================
   BUILDINGS
============================== */

app.get("/api/buildings", async (req, res, next) => {
  try {
    const { data, error } = await supabase.from("buildings").select("*");

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});
/* ==============================
   BUILDING STATUS
============================== */

app.get("/api/buildings/:id/status", async (req, res, next) => {
  try {
    const buildingId = parseInt(req.params.id, 10);

    const { data, error } = await supabase
      .from("slots")
      .select("status, floors!inner(building_id)")
      .eq("floors.building_id", buildingId);

    if (error) throw error;

    const total = data.length;
    const occupied = data.filter((s) => s.status === "occupied").length;

    res.json({
      total,
      occupied,
      free: total - occupied
    });
  } catch (err) {
    next(err);
  }
});
/* ==============================
   PARKING SLOTS (from parking_slots table)
============================== */

// Get slots directly from parking_slots table
app.get("/api/slots", async (req, res, next) => {
  try {
    const { floor_id } = req.query;

    let query = supabase
      .from("parking_slots")
      .select("id, floor_id, code, slot_number, status")
      .order("slot_number");

    if (floor_id) {
      query = query.eq("floor_id", parseInt(floor_id, 10));
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map status for frontend: empty = free, occupied = occupied
    const mappedSlots = (data || []).map(slot => ({
      ...slot,
      status: slot.status === 'occupied' ? 'occupied' : 'free'
    }));

    res.json(mappedSlots);
  } catch (err) {
    next(err);
  }
});

/* ==============================
   FLOOR SLOTS
============================== */

app.get("/api/floors/:id/slots", async (req, res, next) => {
  try {
    const floorId = parseInt(req.params.id, 10);
    try {
      const { data, error } = await supabase
        .from("slots")
        .select("*")
        .eq("floor_id", floorId)
        .order("code");

      if (!error && Array.isArray(data) && data.length) {
        return res.json(data.slice(0, 3));
      }
    } catch (fallbackIgnored) {
      // Fall through to the old sensor-table structure.
    }

    const latestSlots = await loadLatestFloorSlots(floorId);
    res.json(latestSlots);
  } catch (err) {
    next(err);
  }
});

/* ==============================
   UPDATE SLOT STATUS
============================== */

app.post("/api/slots/:id/status", async (req, res, next) => {
  try {
    const slotId = req.params.id;
    const { status } = req.body;

    if (!["free", "occupied"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const now = new Date();
    const statusForHistory = status === "free" ? "empty" : "occupied";

    if (String(slotId).includes("-")) {
      const [floorPart, slotPart] = String(slotId).split("-");
      const floorId = parseInt(floorPart, 10);
      const slotNumber = parseInt(slotPart, 10);
      const tableName = floorId === 2 ? "parking_floor2" : "parking_floor1";

      const { error: historyError } = await supabase
        .from(tableName)
        .insert([
          {
            slot: slotNumber,
            status: statusForHistory,
            created_at: now.toISOString()
          }
        ]);

      if (historyError) throw historyError;

      return res.json({ success: true });
    }

    const numericSlotId = parseInt(slotId, 10);

    const { error: updateError } = await supabase
      .from("slots")
      .update({
        status,
        last_update: now
      })
      .eq("id", numericSlotId);

    if (updateError) throw updateError;

    const action = status === "occupied" ? "enter" : "exit";

    await supabase.from("parking_events").insert([
      {
        slot_id: numericSlotId,
        action,
        created_at: now
      }
    ]);

    if (status === "free") {
      await triggerAlerts(numericSlotId);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ==============================
   ALERT TRIGGER ENGINE
============================== */

async function triggerAlerts(slotId) {
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("slot_id", slotId)
    .eq("enabled", true);

  if (!alerts || alerts.length === 0) return;

  for (const alert of alerts) {
    console.log(`Alert triggered for slot ${slotId}`);

    await supabase.from("notifications_log").insert([
      {
        alert_id: alert.id,
        slot_id: slotId,
        sent_at: new Date()
      }
    ]);
  }
}

/* ==============================
   REALTIME ZONE STATUS
============================== */

app.get("/api/zone/status", async (req, res, next) => {
  try {
    const { data, error } = await supabase.from("slots").select("status");

    if (error) throw error;

    const total = data.length;
    const occupied = data.filter((s) => s.status === "occupied").length;

    res.json({
      total,
      occupied,
      percent: total ? Math.round((occupied / total) * 100) : 0
    });
  } catch (err) {
    next(err);
  }
});


/* ==============================
   GUEST REQUESTS API
============================== */

// Create a new guest request
app.post("/api/guest/request", async (req, res, next) => {
  try {
    const { full_name, license_plate, phone, arrival_time } = req.body;

    // Validation
    if (!full_name || !license_plate || !arrival_time) {
      return res.status(400).json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "Full name, license plate, and arrival time are required"
      });
    }

    // Validate Thai/Unicode characters for name (at least 2 chars)
    const trimmedName = String(full_name).trim();
    if (trimmedName.length < 2) {
      return res.status(400).json({
        error: "INVALID_NAME",
        message: "Name must be at least 2 characters"
      });
    }

    // Validate license plate (at least 3 chars, supports Thai)
    const trimmedPlate = String(license_plate).trim().toUpperCase();
    if (trimmedPlate.length < 3) {
      return res.status(400).json({
        error: "INVALID_LICENSE_PLATE",
        message: "License plate must be at least 3 characters"
      });
    }

    // Validate phone if provided (at least 9 digits)
    let trimmedPhone = phone ? String(phone).trim() : null;
    if (trimmedPhone && trimmedPhone.replace(/\D/g, "").length < 9) {
      return res.status(400).json({
        error: "INVALID_PHONE",
        message: "Phone number must be at least 9 digits"
      });
    }

    // Create the request (auto-approved, no verification needed, no duplicate check)
    const now = new Date();
    const insertData = {
      full_name: trimmedName,
      license_plate: trimmedPlate,
      phone: trimmedPhone,
      status: "approved",  // Auto-approved, no admin verification
      approved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
    };

    console.log("Creating guest request:", insertData);

    // Only add arrival_time if provided (for backward compatibility)
    if (arrival_time) {
      insertData.arrival_time = arrival_time;
    }

    const { data, error } = await supabase
      .from("guest_requests")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    console.log("Guest request created:", data);

    res.status(201).json({
      success: true,
      message: "Request submitted successfully",
      request: {
        id: data.id,
        full_name: data.full_name,
        license_plate: data.license_plate,
        arrival_time: data.arrival_time,
        status: data.status,
        requested_at: data.requested_at
      }
    });
  } catch (err) {
    console.error("Guest request error:", err);
    next(err);
  }
});

// Get guest request by ID
app.get("/api/guest/request/:id", async (req, res, next) => {
  try {
    const requestId = req.params.id;

    const { data, error } = await supabase
      .from("guest_request_overview")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Request not found" });
      }
      throw error;
    }

    res.json({
      id: data.id,
      full_name: data.full_name,
      license_plate: data.license_plate,
      phone: data.phone,
      arrival_time: data.arrival_time,
      status: data.status,
      requested_at: data.requested_at,
      approved_at: data.approved_at,
      checked_in_at: data.checked_in_at,
      checked_out_at: data.checked_out_at,
      expires_at: data.expires_at,
      notes: data.notes,
      rejection_reason: data.rejection_reason,
      slot: data.slot_code ? {
        code: data.slot_code,
        number: data.slot_number,
        floor: data.floor_code,
        floor_name: data.floor_name
      } : null
    });
  } catch (err) {
    next(err);
  }
});

// Cancel/delete a guest request (by the guest)
app.post("/api/guest/request/:id/cancel", async (req, res, next) => {
  try {
    const requestId = req.params.id;

    const { data: existing, error: fetchError } = await supabase
      .from("guest_requests")
      .select("id, status, assigned_slot_id")
      .eq("id", requestId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Request not found" });
      }
      throw fetchError;
    }

    if (!["pending", "approved"].includes(existing.status)) {
      return res.status(400).json({
        error: "CANNOT_CANCEL",
        message: "Only pending or approved requests can be cancelled"
      });
    }

    // Delete the request from database
    const { error: deleteError } = await supabase
      .from("guest_requests")
      .delete()
      .eq("id", requestId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: "Request deleted" });
  } catch (err) {
    next(err);
  }
});

// Search guest requests by phone (for guests to find their requests)
app.get("/api/guest/search", async (req, res, next) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const { data, error } = await supabase
      .from("guest_request_overview")
      .select("*")
      .ilike("phone", `%${phone}%`)
      .order("requested_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    res.json({
      requests: data || [],
      count: data ? data.length : 0
    });
  } catch (err) {
    next(err);
  }
});

// List all guest requests (for admin)
app.get("/api/guest/requests", async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("guest_request_overview")
      .select("*", { count: "exact" })
      .order("requested_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      requests: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    next(err);
  }
});

// Approve a guest request (admin only)
app.post("/api/guest/request/:id/approve", async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const { slot_id, notes } = req.body;

    if (!slot_id) {
      return res.status(400).json({ error: "Slot ID is required" });
    }

    // Get admin user from auth header (simplified - in production use proper auth)
    const { data: request, error } = await supabase.rpc("approve_guest_request", {
      p_request_id: requestId,
      p_slot_id: parseInt(slot_id),
      p_admin_id: null, // Will be set from auth context in production
      p_notes: notes || null
    });

    if (error) {
      if (error.message.includes("REQUEST_NOT_FOUND")) {
        return res.status(404).json({ error: "Request not found or not pending" });
      }
      if (error.message.includes("SLOT_NOT_AVAILABLE")) {
        return res.status(400).json({ error: "Selected slot is not available" });
      }
      throw error;
    }

    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

// Reject a guest request (admin only)
app.post("/api/guest/request/:id/reject", async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const { reason } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from("guest_requests")
      .select("id, status")
      .eq("id", requestId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Request not found" });
      }
      throw fetchError;
    }

    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only pending requests can be rejected" });
    }

    const { error: updateError } = await supabase
      .from("guest_requests")
      .update({
        status: "rejected",
        rejection_reason: reason || null
      })
      .eq("id", requestId);

    if (updateError) throw updateError;

    res.json({ success: true, message: "Request rejected" });
  } catch (err) {
    next(err);
  }
});

// Check in a guest (admin only)
app.post("/api/guest/request/:id/checkin", async (req, res, next) => {
  try {
    const requestId = req.params.id;

    const { data, error } = await supabase.rpc("checkin_guest_request", {
      p_request_id: requestId
    });

    if (error) {
      if (error.message.includes("REQUEST_NOT_APPROVED")) {
        return res.status(400).json({ error: "Request not approved or expired" });
      }
      throw error;
    }

    res.json({ success: true, request: data });
  } catch (err) {
    next(err);
  }
});

// Check out a guest (admin only)
app.post("/api/guest/request/:id/checkout", async (req, res, next) => {
  try {
    const requestId = req.params.id;

    const { data, error } = await supabase.rpc("checkout_guest_request", {
      p_request_id: requestId
    });

    if (error) {
      if (error.message.includes("REQUEST_NOT_CHECKED_IN")) {
        return res.status(400).json({ error: "Request not checked in" });
      }
      throw error;
    }

    res.json({ success: true, request: data });
  } catch (err) {
    next(err);
  }
});

/* ==============================
   GLOBAL ERROR HANDLER
============================== */

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.message);
  console.error("Stack:", err.stack);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

/* ==============================
   START SERVER
============================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
