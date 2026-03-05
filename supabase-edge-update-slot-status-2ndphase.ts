// Supabase Edge Function: update-slot-status (2nd phase)
// Called by ESP32 with a shared SENSOR_API_KEY.
// Updates slot_status.occupied for a (floor, position) pair.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sensorApiKey = Deno.env.get("SENSOR_API_KEY")!; // set in Supabase env

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    if (apiKey !== sensorApiKey) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await req.json();
    const { floor, position, occupied } = body as {
      floor: "GND" | "UPP";
      position: "LEFT" | "MIDDLE" | "RIGHT";
      occupied: boolean;
    };

    if (!floor || !position || typeof occupied !== "boolean") {
      return new Response("Bad Request", { status: 400 });
    }

    // Look up slot by logical coordinates
    const { data: slot, error: slotError } = await supabaseAdmin
      .from("slots")
      .select("id")
      .eq("floor", floor)
      .eq("position", position)
      .single();

    if (slotError || !slot) {
      console.error("Slot lookup error:", slotError);
      return new Response("Slot not found", { status: 404 });
    }

    const now = new Date().toISOString();

    // Upsert occupancy
    const { error: upsertError } = await supabaseAdmin
      .from("slot_status")
      .upsert(
        {
          slot_id: slot.id,
          occupied,
          updated_at: now,
        },
        { onConflict: "slot_id" }
      );

    if (upsertError) {
      console.error("slot_status upsert error:", upsertError);
      return new Response("DB Error", { status: 500 });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("update-slot-status error:", e);
    return new Response("Server Error", { status: 500 });
  }
});

