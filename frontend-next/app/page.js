"use client";

import { useEffect, useMemo, useState } from "react";
import BottomNav from "@/components/BottomNav";
import { getApiBase } from "@/lib/apiBase";

const FLOORS = [
  { id: "F1", name: "1st Floor", subtitle: "3 parking slots", apiId: 1 },
  { id: "F2", name: "2nd Floor", subtitle: "3 parking slots", apiId: 2 },
];

async function fetchFloorSlots(apiBase, floorId) {
  const res = await fetch(`${apiBase}/floors/${floorId}/slots`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Unable to load floor ${floorId}`);
  return await res.json();
}

function computeStats(slots) {
  const total = Array.isArray(slots) ? slots.length : 0;
  const occupied = Array.isArray(slots)
    ? slots.filter((slot) => slot.status === "occupied").length
    : 0;
  return { total, occupied, free: Math.max(0, total - occupied) };
}

export default function HomePage() {
  const apiBase = useMemo(() => getApiBase(), []);
  const [stats, setStats] = useState(() => ({
    F1: { total: 3, occupied: 0, free: 3 },
    F2: { total: 3, occupied: 0, free: 3 },
  }));
  const [error, setError] = useState("");
  const [nowLabel, setNowLabel] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    async function tick() {
      setNowLabel(new Date().toLocaleTimeString());
      try {
        const pairs = await Promise.all(
          FLOORS.map(async (floor) => {
            const slots = await fetchFloorSlots(apiBase, floor.apiId);
            return [floor.id, computeStats(slots)];
          })
        );
        if (!cancelled) {
          setStats(Object.fromEntries(pairs));
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Connection error");
      }
    }

    tick();
    timer = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [apiBase]);

  return (
    <>
      <div className="container" style={{ paddingBottom: 90 }}>
        <div
          className="top-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            
            alignItems: "flex-start",
            marginBottom: 18,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>EZP Parking</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Assumption University • Live system
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <a
              href="/auth"
              style={{
                border: `1px solid var(--panel-border)`,
                background: "transparent",
                color: "var(--text)",
                padding: "8px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Account
            </a>
            <div
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                border: `1px solid var(--panel-border)`,
                background: "rgba(0,0,0,0.2)",
                color: "var(--accent)",
                fontSize: 13,
              }}
            >
              ● Online • ~3s updates
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {FLOORS.map((floor) => {
            const s = stats[floor.id] || { total: 0, occupied: 0, free: 0 };
            return (
              <div
                key={floor.id}
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
                  border: `1px solid var(--panel-border)`,
                  borderRadius: 16,
                  padding: 18,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{floor.name}</div>
                  <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>
                    {s.free} / {s.total}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {floor.subtitle}
                  </div>
                </div>
                <a
                  href={`/floor#${floor.id}`}
                  style={{
                    border: `1px solid var(--panel-border)`,
                    background: "transparent",
                    color: "var(--text)",
                    padding: "8px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                >
                  View
                </a>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 18,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
            border: `1px solid var(--panel-border)`,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Detail</div>
          {error ? (
            <div style={{ color: "var(--danger)" }}>{error}</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {FLOORS.map((floor) => {
                const s = stats[floor.id] || { total: 0, occupied: 0, free: 0 };
                const occPct = s.total ? Math.round((s.occupied / s.total) * 100) : 0;
                return (
                  <div
                    key={floor.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 14,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.01)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          background: "rgba(0,150,120,0.15)",
                          color: "var(--accent)",
                          fontWeight: 800,
                        }}
                      >
                        {floor.id}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800 }}>{floor.name}</div>
                        <div style={{ color: "var(--accent)", marginTop: 6 }}>
                          Free {s.free} / {s.total}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>{nowLabel}</div>
                      <div className="progress">
                        <span style={{ width: `${occPct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </>
  );
}

