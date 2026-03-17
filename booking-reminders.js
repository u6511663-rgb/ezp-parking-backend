(function () {
  const STORAGE = {
    reminderEnabled: "ezp_settings_booking_reminder_enabled",
    reminderMinutes: "ezp_settings_booking_reminder_minutes",
    browserNotification: "ezp_settings_browser_notification"
  };

  let supabaseClient = null;
  let reminderTimer = null;

  function remindersEnabled() {
    return localStorage.getItem(STORAGE.reminderEnabled) !== "false";
  }

  function getReminderMinutes() {
    const raw = Number(localStorage.getItem(STORAGE.reminderMinutes) || "10");
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
  }

  function browserNotificationsEnabled() {
    return localStorage.getItem(STORAGE.browserNotification) === "true";
  }

  function getSentReminderKey(bookingId) {
    return `ezp_global_booking_alert_${bookingId}`;
  }

  function ensureReminderStyles() {
    if (document.getElementById("globalBookingReminderStyles")) return;

    const style = document.createElement("style");
    style.id = "globalBookingReminderStyles";
    style.textContent = `
      .global-booking-reminder {
        position: fixed;
        right: 18px;
        top: 18px;
        width: min(360px, calc(100vw - 36px));
        z-index: 999;
        display: none;
        border-radius: 16px;
        padding: 16px;
        border: 1px solid rgba(255,210,122,0.28);
        background: linear-gradient(180deg, rgba(255,210,122,0.18), rgba(255,210,122,0.08));
        color: #fff1cb;
        box-shadow: 0 16px 32px rgba(0,0,0,0.35);
        backdrop-filter: blur(10px);
      }
      .global-booking-reminder.show {
        display: block;
      }
      .global-booking-reminder-title {
        font-weight: 800;
        margin-bottom: 6px;
      }
      .global-booking-reminder-copy {
        font-size: 13px;
        line-height: 1.45;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureReminderBox() {
    ensureReminderStyles();
    let box = document.getElementById("globalBookingReminder");
    if (box) return box;

    box = document.createElement("div");
    box.id = "globalBookingReminder";
    box.className = "global-booking-reminder";
    box.innerHTML = `
      <div class="global-booking-reminder-title">Upcoming booking</div>
      <div class="global-booking-reminder-copy" id="globalBookingReminderCopy"></div>
    `;
    document.body.appendChild(box);
    return box;
  }

  function hideReminder() {
    const box = document.getElementById("globalBookingReminder");
    if (!box) return;
    box.classList.remove("show");
    const copy = document.getElementById("globalBookingReminderCopy");
    if (copy) copy.textContent = "";
  }

  function showReminder(text) {
    const box = ensureReminderBox();
    const copy = document.getElementById("globalBookingReminderCopy");
    if (copy) copy.textContent = text;
    box.classList.add("show");
  }

  async function initSupabaseClient() {
    if (supabaseClient || !window.supabase || typeof window.supabase.createClient !== "function") {
      return;
    }

    const response = await fetch("/api/public-config", {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("Public Supabase config is not available.");
    }

    const config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase config is incomplete.");
    }

    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  async function loadUpcomingBookings(userId) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from("bookings")
      .select(`
        id,
        start_time,
        end_time,
        status,
        vehicle_registrations:vehicle_id (
          plate_number,
          registration_city
        ),
        parking_slots:slot_id (
          code,
          slot_number
        )
      `)
      .eq("user_id", userId)
      .gte("end_time", nowIso)
      .not("status", "in", "(completed,cancelled,expired)")
      .order("start_time", { ascending: true })
      .limit(10);

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function buildReminderText(booking, minutesAway) {
    const vehicle = booking.vehicle_registrations || {};
    const slot = booking.parking_slots || {};
    const carLabel = vehicle.registration_city
      ? `${vehicle.plate_number} • ${vehicle.registration_city}`
      : (vehicle.plate_number || "your car");
    const slotLabel = slot.code || (slot.slot_number ? `Slot ${slot.slot_number}` : "your slot");
    const whenLabel = minutesAway <= 1 ? "less than 1 minute" : `${minutesAway} minutes`;
    return `${carLabel} is booked for ${slotLabel}. It starts in ${whenLabel}.`;
  }

  function maybeSendNotification(booking, text) {
    if (!browserNotificationsEnabled()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const sentKey = getSentReminderKey(booking.id);
    if (localStorage.getItem(sentKey)) return;

    new Notification("EZP Booking Reminder", {
      body: text,
      tag: `booking-${booking.id}`
    });

    localStorage.setItem(sentKey, new Date().toISOString());
  }

  async function checkReminders() {
    if (!remindersEnabled()) {
      hideReminder();
      return;
    }

    try {
      await initSupabaseClient();
      if (!supabaseClient) return;

      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;

      const session = data ? data.session : null;
      if (!session || !session.user) {
        hideReminder();
        return;
      }

      const bookings = await loadUpcomingBookings(session.user.id);
      const now = Date.now();
      const reminderMinutes = getReminderMinutes();

      const soonBooking = bookings.find((booking) => {
        const startMs = new Date(booking.start_time).getTime();
        if (Number.isNaN(startMs)) return false;
        const diffMinutes = (startMs - now) / 60000;
        return diffMinutes >= 0 && diffMinutes <= reminderMinutes;
      });

      if (!soonBooking) {
        hideReminder();
        return;
      }

      const minutesAway = Math.max(0, Math.ceil((new Date(soonBooking.start_time).getTime() - now) / 60000));
      const text = buildReminderText(soonBooking, minutesAway);
      showReminder(text);
      maybeSendNotification(soonBooking, text);
    } catch (err) {
      console.warn("Global booking reminder failed:", err.message || err);
    }
  }

  async function startReminders() {
    hideReminder();
    await checkReminders();
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = window.setInterval(checkReminders, 60000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    startReminders();
  });
})();
