// api.js
const API_BASE = "http://localhost:3000/api";

async function apiGetBuildings() {
  const res = await fetch(API_BASE + "/buildings");
  return await res.json();
}

async function apiGetFloors(buildingId) {
  const res = await fetch(API_BASE + "/floors/" + buildingId);
  return await res.json();
}

async function apiGetSlots(floorId) {
  const res = await fetch(API_BASE + "/slots/" + floorId);
  return await res.json();
}

