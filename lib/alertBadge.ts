import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";

// Incident statuses that appear on the Alerts screen.
export const ALERT_STATUSES = ["open", "submitted", "draft", "in_progress", "under_review"];

const ALERTS_SEEN_KEY = "sira_alerts_seen_at";
const BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function markAlertsSeen() {
  try {
    await AsyncStorage.setItem(ALERTS_SEEN_KEY, new Date().toISOString());
  } catch {
    // The badge simply keeps counting from the last 24 hours.
  }
}

async function getAlertsSeenAt() {
  try {
    return Date.parse((await AsyncStorage.getItem(ALERTS_SEEN_KEY)) ?? "") || 0;
  } catch {
    return 0;
  }
}

// New alerts: reported in the last 24 hours, after the Alerts screen was last
// opened, and not reported by the signed-in user.
export async function countNewAlerts(userId: string | null | undefined) {
  const since = new Date(
    Math.max(Date.now() - BADGE_WINDOW_MS, await getAlertsSeenAt())
  ).toISOString();

  let query = supabase
    .from("sira_incidents")
    .select("id", { count: "exact", head: true })
    .eq("incident_type", "fiber_network_risk")
    .in("status", ALERT_STATUSES)
    .gt("created_at", since);

  if (userId) {
    query = query.or(`reporter_user_id.is.null,reporter_user_id.neq.${userId}`);
  }

  const { count, error } = await query;
  return error ? 0 : count ?? 0;
}
