const supabase = require("./supabase");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
// =======================
// SUPABASE CONNECTION
// =======================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// =======================
// TEST API
// =======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});


// =======================
// GET ALL BUILDINGS
// =======================
app.get("/api/buildings", async (req, res) => {
  const { data, error } = await supabase.from("buildings").select("*");
  if (error) return res.status(500).json(error);
  res.json(data);
});

// =======================
// GET FLOORS IN BUILDING
// =======================
app.get("/api/buildings/:id/floors", async (req, res) => {
  const { data, error } = await supabase
    .from("floors")
    .select("*")
    .eq("building_id", req.params.id);

  if (error) return res.status(500).json(error);
  res.json(data);
});

// =======================
// GET SLOTS IN FLOOR
// =======================
app.get("/api/floors/:id/slots", async (req, res) => {
  const { data, error } = await supabase
    .from("slots")
    .select("*")
    .eq("floor_id", req.params.id)
    .order("code");

  if (error) return res.status(500).json(error);
  res.json(data);
});

// =======================
// GET BUILDING STATUS
// =======================
app.get("/api/buildings/:id/status", async (req, res) => {
  const buildingId = req.params.id;

  const { data: slots, error } = await supabase
    .from("slots")
    .select("status, floors!inner(building_id)")
    .eq("floors.building_id", buildingId);

  if (error) return res.status(500).json(error);

  const total = slots.length;
  const free = slots.filter(s => s.status === "free").length;

  res.json({
    building_id: buildingId,
    total,
    free,
    occupied: total - free
  });
});

// =======================
// UPDATE SLOT STATUS + SAVE HISTORY
// =======================
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

  if (error) return res.status(500).json(error);

  // insert history
  const action = status === "occupied" ? "enter" : "exit";

  await supabase.from("parking_history").insert([
    { slot_id: slotId, action }
  ]);

  res.json({ success: true });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
