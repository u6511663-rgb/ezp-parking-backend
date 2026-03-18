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
app.use(express.static(__dirname));
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
   GLOBAL ERROR HANDLER
============================== */

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.message);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ==============================
   START SERVER
============================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
