"use client";

import { useEffect, useMemo, useState } from "react";
import BottomNav from "@/components/BottomNav";
import { getApiBase } from "@/lib/apiBase";

const FLOOR_ID_MAP = { F1: 1, F2: 2 };
const FLOOR_LAYOUT = {
  F1: { rows: [["F1-S1", "F1-S2", "F1-S3"]] },
  F2: { rows: [["F2-S1", "F2-S2", "F2-S3"]] },
};

function normalizeLevel(raw) {
  const level = String(raw || "").replace("#", "").toUpperCase();
  return level === "F2" ? "F2" : "F1";
}

function buildDefaultSlot(level, index, floorId) {
  return {
    id: `${floorId}-${index + 1}`,
    floor_id: floorId,
    slot: index + 1,
    code: `${level}-S${index + 1}`,
    displayCode: `${level}-0${index + 1}`,
    status: "free",
  };
}

async function loadSlots(apiBase, floorId) {
  const res = await fetch(`${apiBase}/floors/${floorId}/slots`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return await res.json();
}

export default function FloorPage() {
  const apiBase = useMemo(() => getApiBase(), []);
  const [level, setLevel] = useState("F1");
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    setLevel(normalizeLevel(window.location.hash));
  }, []);

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    async function refresh() {
      const floorId = FLOOR_ID_MAP[level];
      const raw = await loadSlots(apiBase, floorId);

      const normalized = Array.from({ length: 3 }, (_, index) => {
        const source = Array.isArray(raw) ? raw[index] : null;
        if (!source) return buildDefaultSlot(level, index, floorId);

        const displayCode = `${level}-0${index + 1}`;
        const syntheticCode = `${level}-S${index + 1}`;
        return {
          ...source,
          code: syntheticCode,
          displayCode,
          status: source.status === "occupied" ? "occupied" : "free",
        };
      });

      if (!cancelled) setSlots(normalized);
    }

    refresh();
    timer = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [apiBase, level]);

  const total = slots.length || 3;
  const free = slots.filter((s) => s.status === "free").length;
  const occ = Math.max(0, total - free);

  const title = level === "F2" ? "2nd Floor" : "1st Floor";
  const sub =
    level === "F2"
      ? "Barrier booking floor with 3 slots"
      : "General parking floor with 3 slots";

  const slotMap = useMemo(() => {
    const map = new Map();
    slots.forEach((s) => map.set(s.code, s));
    return map;
  }, [slots]);

  return (
    <>
      <div className="container" style={{ maxWidth: 1100, paddingBottom: 90 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            style={{
              border: 0,
              background: "transparent",
              color: "var(--muted)",
              fontSize: 20,
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 999,
            }}
            aria-label="Back"
          >
            ←
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</div>

            <div
              style={{
                marginTop: 6,
                display: "inline-flex",
                padding: 3,
                borderRadius: 999,
                background: "rgba(255,255,255,0.04)",
                width: "fit-content",
              }}
            >
              {["F1", "F2"].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setLevel(lvl);
                    window.location.hash = lvl;
                  }}
                  style={{
                    border: 0,
                    background: lvl === level ? "var(--panel)" : "transparent",
                    color: lvl === level ? "var(--accent)" : "var(--muted)",
                    padding: "5px 14px",
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow:
                      lvl === level ? "0 6px 18px rgba(0,0,0,0.45)" : "none",
                  }}
                >
                  {lvl === "F2" ? "2nd Floor" : "1st Floor"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 13 }}>
            Free {free} • Occ {occ}
          </div>
        </div>

        <div
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.03))",
            borderRadius: 14,
            padding: 18,
            border: `1px solid var(--panel-border)`,
            boxShadow: "0 10px 26px rgba(2,6,12,0.55)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              fontSize: 13,
              color: "var(--muted)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: "var(--accent)",
                }}
              />
              <span>Free</span>
              <span style={{ width: 10 }} />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: "var(--danger)",
                }}
              />
              <span>Occupied</span>
              <span style={{ width: 10 }} />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: "#86c5ff",
                }}
              />
              <span>Accessible</span>
            </div>
            <div
              style={{
                background: "rgba(230,100,100,0.08)",
                color: "var(--danger)",
                padding: "6px 10px",
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              Old bottom gate sealed
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background:
                "linear-gradient(180deg, rgba(7,15,28,0.98), rgba(5,11,22,0.98))",
              border: "1px solid rgba(86,122,168,0.14)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {FLOOR_LAYOUT[level].rows.map((rowDef, idx) => (
              <div
                key={idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(150px, 1fr))",
                  gap: 14,
                  maxWidth: 560,
                  margin: "0 auto",
                  width: "100%",
                }}
              >
                {rowDef.map((code) => {
                  const slot = slotMap.get(code);
                  if (!slot) return <div key={code} style={{ minHeight: 40 }} />;
                  const isFree = slot.status === "free";
                  return (
                    <div key={code} style={{ minHeight: 40 }}>
                      <div
                        className={`slot-tile ${isFree ? "free" : "occupied"}`}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 10,
                          padding: "10px 8px",
                          border: "2px solid rgba(255,255,255,0.08)",
                          background:
                            "linear-gradient(180deg, rgba(12,18,30,0.96), rgba(7,12,22,0.96))",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "default",
                          minHeight: 72,
                          position: "relative",
                          color: isFree ? "#34f5ae" : "#ff6b6b",
                          borderColor: isFree
                            ? "rgba(18,211,144,0.75)"
                            : "rgba(255,91,91,0.8)",
                          boxShadow: isFree
                            ? "0 0 0 1px rgba(18,211,144,0.14), inset 0 0 18px rgba(18,211,144,0.06)"
                            : "0 0 0 1px rgba(255,91,91,0.12), inset 0 0 18px rgba(255,91,91,0.08)",
                        }}
                      >
                        <div style={{ marginBottom: 6, fontSize: 12, letterSpacing: ".04em" }}>
                          {slot.displayCode || slot.code}
                        </div>
                        <div style={{ fontSize: 16, opacity: 0.85 }}>🚗</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--muted)",
              fontSize: 12,
              marginTop: 2,
              padding: "0 4px",
            }}
          >
            <div>← Entry</div>
            <div>Exit →</div>
          </div>
        </div>
      </div>

      <BottomNav />
    </>
  );
}

