// Supabase Edge Function: check-in (2nd phase)
// Validates a reservation against:
// - current user (Supabase Auth)
// - plate ownership
// - reservation window (server time)
// - reservation status
// Returns: { status: "ALLOW" | "DENY", reason: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: "DENY", reason: "NO_AUTH" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json();
    const { reservation_id, plate_id } = body as {
      reservation_id: string;
      plate_id: string;
    };

    if (!reservation_id || !plate_id) {
      return new Response(
        JSON.stringify({ status: "DENY", reason: "BAD_REQUEST" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ status: "DENY", reason: "AUTH_FAILED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call DB validation function
    const { data, error } = await supabase.rpc("validate_check_in", {
      p_reservation_id: reservation_id,
      p_user_id: user.id,
      p_plate_id: plate_id,
    });

    if (error) {
      console.error("validate_check_in error:", error);
      return new Response(
        JSON.stringify({ status: "DENY", reason: "SERVER_ERROR" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!result) {
      return new Response(
        JSON.stringify({ status: "DENY", reason: "UNKNOWN" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: result.allowed ? "ALLOW" : "DENY",
        reason: result.reason,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("check-in error:", e);
    return new Response(
      JSON.stringify({ status: "DENY", reason: "UNEXPECTED_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

