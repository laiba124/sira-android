import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SiraHeader from "../../../components/SiraHeader";
import { ALERT_STATUSES } from "../../../lib/alertBadge";
import { fetchAllRows } from "../../../lib/fetchAllRows";
import { formatDateTime } from "../../../lib/format";
import { supabase } from "../../../lib/supabase";

type FiberAlert = {
  id: string;
  title: string;
  status: string;
  severity: string;
  address_text: string | null;
  city: string | null;
  created_at: string;
};

function operationalStatus(status: string) {
  if (status === "in_progress" || status === "under_review") return "in_progress";
  return "open";
}

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<FiberAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from("sira_incidents")
        .select("id, title, status, severity, address_text, city, created_at")
        .eq("incident_type", "fiber_network_risk")
        .in("status", ALERT_STATUSES)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (error) Alert.alert("Alerts could not load", error.message);
    else setAlerts((data ?? []) as FiberAlert[]);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  async function refresh() {
    setRefreshing(true);
    await loadAlerts();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <SiraHeader />
      <FlatList
        data={loading ? [] : alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <>
            <Text allowFontScaling={false} style={styles.pageTitle}>Fiber Risk Alerts</Text>
            <Text allowFontScaling={false} style={styles.pageSubtitle}>
              Open and work-in-progress FR incidents requiring field attention.
            </Text>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color="#1267e8" />
              <Text allowFontScaling={false} style={styles.stateText}>Loading alerts...</Text>
            </View>
          ) : (
            <View style={styles.stateBox}>
              <View style={styles.clearIcon}>
                <Ionicons name="checkmark-circle" size={34} color="#16a34a" />
              </View>
              <Text allowFontScaling={false} style={styles.emptyTitle}>No active Fiber Risk alerts</Text>
              <Text allowFontScaling={false} style={styles.stateText}>
                All recorded Fiber Risk incidents are resolved.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const status = operationalStatus(item.status);
          const color = status === "in_progress" ? "#f97316" : "#dc2626";
          const label = status === "in_progress" ? "Work in Progress" : "Open";
          const location = item.address_text || item.city || "GPS selected location";

          return (
            <Pressable
              style={styles.alertCard}
              onPress={() => router.push(`/incident/${item.id}` as any)}
            >
              <View style={[styles.iconBox, { backgroundColor: color }]}>
                <Ionicons name="git-network-outline" size={24} color="#ffffff" />
              </View>
              <View style={styles.alertText}>
                <View style={styles.alertTopLine}>
                  <Text allowFontScaling={false} numberOfLines={1} style={styles.alertTitle}>
                    {item.title || "Fiber Network Risk"}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: `${color}18` }]}>
                    <Text allowFontScaling={false} style={[styles.statusText, { color }]}>{label}</Text>
                  </View>
                </View>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.alertSub}>{location}</Text>
                <Text allowFontScaling={false} style={styles.alertDate}>
                  {String(item.severity ?? "medium").toUpperCase()} • {formatDateTime(item.created_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
            </Pressable>
          );
        }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f7faff" },
  content: { padding: 18, paddingBottom: 110 },
  pageTitle: { fontSize: 32, color: "#0f172a", fontWeight: "900" },
  pageSubtitle: { marginTop: 4, marginBottom: 18, color: "#64748b", fontSize: 14, fontWeight: "600" },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5edf6",
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  iconBox: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginRight: 12 },
  alertText: { flex: 1, minWidth: 0 },
  alertTopLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  alertTitle: { flex: 1, color: "#0f172a", fontSize: 14.5, fontWeight: "900" },
  statusPill: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontSize: 8.5, fontWeight: "900" },
  alertSub: { marginTop: 5, color: "#64748b", fontSize: 12, fontWeight: "700" },
  alertDate: { marginTop: 4, color: "#94a3b8", fontSize: 10, fontWeight: "800" },
  stateBox: { minHeight: 260, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  stateText: { marginTop: 9, textAlign: "center", color: "#64748b", fontSize: 13, fontWeight: "700" },
  clearIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 12, color: "#0f172a", fontSize: 17, fontWeight: "900" },
});
