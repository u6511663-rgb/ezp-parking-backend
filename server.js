const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* ============================
   SUPABASE CONNECTION
============================ */

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase environment variables missing");
  process.exit(1);
}

console.log("🔗 Connected to Supabase:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

/* ============================
   ROOT PAGE
============================ */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

/* ============================
   GET ALL BUILDINGS
============================ */

app.get("/api/buildings", async (req, res) => {
  const { data, error } = await supabase
    .from("buildings")
    .select("*");

  if (error) {
    console.error("Buildings error:", error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});
// =======================
// GET FLOOR BY CODE
// =======================
app.get("/api/floors", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Missing floor code" });
  }

  const { data, error } = await supabase
    .from("floors")
    .select("*")
    .eq("code", code)
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json(error);
  }

  res.json(data);
});
/* ============================
   GET SLOTS IN FLOOR
============================ */

app.get("/api/floors/:id/slots", async (req, res) => {
  const floorId = req.params.id;

  const { data, error } = await supabase
    .from("slots")
    .select("*")
    .eq("floor_id", floorId)
    .order("code");

  if (error) {
    console.error("Slots error:", error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

/* ============================
   GET BUILDING STATUS
============================ */

app.get("/api/buildings/:id/status", async (req, res) => {
  const buildingId = req.params.id;

  const { data, error } = await supabase
    .from("slots")
    .select("status, floors!inner(building_id)")
    .eq("floors.building_id", buildingId);

  if (error) {
    console.error("Status error:", error);
    return res.status(500).json({ error: error.message });
  }

  const total = data.length;
  const free = data.filter(s => s.status === "free").length;

  res.json({
    building_id: buildingId,
    total,
    free,
    occupied: total - free
  });
});

/* ============================
   UPDATE SLOT STATUS
============================ */
app.post("/api/slots/:id/status", async (req, res) => {

  const slotId = req.params.id;
  const { status } = req.body;

  if (!["free", "occupied"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const now = new Date();

  // 1️⃣ Update slot
  const { error: slotError } = await supabase
    .from("slots")
    .update({
      status,
      last_update: now
    })
    .eq("id", slotId);

  if (slotError) {
    return res.status(500).json(slotError);
  }

  // 2️⃣ Insert history using SAME timestamp
  const action = status === "occupied" ? "enter" : "exit";

  const { error: historyError } = await supabase
    .from("parking_history")
    .insert([{
      slot_id: slotId,
      action,
      time: now
    }]);

  if (historyError) {
    return res.status(500).json(historyError);
  }

  res.json({ success: true });
});

// =======================
// INSIGHTS - Historical hourly pattern
// =======================
app.get("/api/insights/hourly", async (req, res) => {

  const day = req.query.day || "today"; // default today

  const now = new Date();
  const thailandNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );

  let start = new Date(thailandNow);
  let end = new Date(thailandNow);

  if (day === "yesterday") {
    start.setDate(start.getDate() - 1);
  }

  // 00:00
  start.setHours(0,0,0,0);

  // 23:59:59
  end = new Date(start);
  end.setHours(23,59,59,999);

  const { data, error } = await supabase
    .from("parking_history")
    .select("time")
    .gte("time", start.toISOString())
    .lte("time", end.toISOString());

  if (error) return res.status(500).json(error);

  const hours = Array(24).fill(0);

  data.forEach(row => {
    const date = new Date(row.time);
    const thailandHour =
      new Date(
        date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
      ).getHours();

    hours[thailandHour]++;
  });

  const max = Math.max(...hours) || 1;

  const result = hours.map((count, hour) => ({
    hour,
    count,
    percent: Math.round((count / max) * 100)
  }));

  res.json(result);
});


/* ============================
   START SERVER
============================ */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
