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

  // update slot
  const { error } = await supabase
    .from("slots")
    .update({ status })
    .eq("id", slotId);

  if (error) {
    console.error("Update error:", error);
    return res.status(500).json({ error: error.message });
  }

  // save history
  const action = status === "occupied" ? "enter" : "exit";

  await supabase
    .from("parking_history")
    .insert([{ slot_id: slotId, action }]);

  res.json({ success: true });
});

/* ============================
   START SERVER
============================ */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
