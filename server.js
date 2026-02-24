const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* =============================
   SUPABASE
============================= */

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("❌ Missing Supabase ENV");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log("🔗 Supabase connected");

/* =============================
   ROOT
============================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

/* =============================
   GET BUILDINGS
============================= */

app.get("/api/buildings", async (req, res) => {

  const { data, error } = await supabase
    .from("buildings")
    .select("*");

  if (error) return res.status(500).json(error);

  res.json(data);
});

/* =============================
   GET SLOTS IN FLOOR
============================= */

app.get("/api/floors/:id/slots", async (req, res) => {

  const floorId = parseInt(req.params.id);

  const { data, error } = await supabase
    .from("slots")
    .select("*")
    .eq("floor_id", floorId)
    .order("code");

  if (error) return res.status(500).json(error);

  res.json(data);
});

/* =============================
   UPDATE SLOT STATUS
============================= */

app.post("/api/slots/:id/status", async (req, res) => {

  const slotId = parseInt(req.params.id);
  const { status } = req.body;

  if (!["free","occupied"].includes(status))
    return res.status(400).json({ error: "Invalid status" });

  const now = new Date();
  const action = status === "occupied" ? "enter" : "exit";

  // 1️⃣ Update current state
  const { data: updated, error: updateErr } = await supabase
    .from("slots")
    .update({ status, last_update: now })
    .eq("id", slotId)
    .select();

  if (updateErr) return res.status(500).json(updateErr);

  if (!updated || updated.length === 0)
    return res.status(404).json({ error: "Slot not found" });

  // 2️⃣ Insert event log
  const { error: eventErr } = await supabase
    .from("parking_events")
    .insert([{
      slot_id: slotId,
      action,
      created_at: now
    }]);

  if (eventErr) return res.status(500).json(eventErr);

  res.json({ success: true });
});

/* =============================
   REALTIME ZONE STATUS
============================= */

app.get("/api/zone/status", async (req, res) => {

  const { data, error } = await supabase
    .from("slots")
    .select("status");

  if (error) return res.status(500).json(error);

  const total = data.length;
  const occupied = data.filter(s => s.status === "occupied").length;

  res.json({
    total,
    occupied,
    percent: total ? Math.round((occupied/total)*100) : 0
  });
});

/* =============================
   HOURLY INSIGHT (Traffic)
============================= */

app.get("/api/insights/hourly", async (req, res) => {

  const day = req.query.day || "today";

  const now = new Date();
  const start = new Date(now);
  if (day === "yesterday")
    start.setDate(start.getDate()-1);

  start.setHours(0,0,0,0);

  const end = new Date(start);
  end.setHours(23,59,59,999);

  const { data, error } = await supabase
    .from("parking_events")
    .select("created_at, action")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (error) return res.status(500).json(error);

  const hours = Array(24).fill(0);

  data.forEach(e=>{
    if (e.action !== "enter") return;
    const h = new Date(e.created_at).getHours();
    hours[h]++;
  });

  const max = Math.max(...hours) || 1;

  res.json(
    hours.map((count,h)=>({
      hour:h,
      count,
      percent:Math.round((count/max)*100)
    }))
  );
});

/* =============================
   WEEKLY TREND
============================= */

app.get("/api/insights/weekly", async (req,res)=>{

  const result = [];

  for(let i=6;i>=0;i--){

    const start = new Date();
    start.setDate(start.getDate()-i);
    start.setHours(0,0,0,0);

    const end = new Date(start);
    end.setHours(23,59,59,999);

    const { data } = await supabase
      .from("parking_events")
      .select("id")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    result.push({
      date:start.toISOString().slice(0,10),
      traffic:data.length
    });
  }

  res.json(result);
});

/* =============================
   HEATMAP (Day x Hour)
============================= */

app.get("/api/insights/heatmap", async (req,res)=>{

  const { data } = await supabase
    .from("parking_events")
    .select("created_at");

  const grid = {};

  data.forEach(e=>{
    const d = new Date(e.created_at);
    const day = d.getDay();
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    grid[key] = (grid[key]||0)+1;
  });

  res.json(grid);
});

/* =============================
   SERVER START
============================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log(`🚀 Server running on port ${PORT}`);
});
