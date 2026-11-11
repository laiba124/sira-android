import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SiraTopBar from "../../../../components/SiraTopBar";
import { supabase } from "../../../../lib/supabase";

type StatusType = "open" | "in_progress" | "resolved";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

const STATUSES: { key: StatusType; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

function normalizeStatus(status: string | null | undefined): StatusType {
  if (status === "resolved") return "resolved";
  if (status === "in_progress" || status === "under_review") return "in_progress";
  return "open";
}

export default function EditIncidentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("high");
  const [status, setStatus] = useState<StatusType>("open");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addressText, setAddressText] = useState("");
  const [city, setCity] = useState("");
  const [supportRequired, setSupportRequired] = useState("");

  useEffect(() => {
    loadIncident();
  }, [params.id]);

  async function loadIncident() {
    if (!params.id) return;

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      Alert.alert("Sign in required", "Please sign in before editing an incident.", [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("sira_incidents")
      .select("*")
      .eq("id", params.id)
      .eq("incident_type", "fiber_network_risk")
      .eq("reporter_user_id", user.id)
      .maybeSingle();

    if (error) {
      setLoading(false);
      Alert.alert("Load failed", error.message);
      return;
    }

    if (!data) {
      setLoading(false);
      Alert.alert(
        "Not allowed",
        "Only the user who uploaded this Fiber Risk incident can edit it.",
        [{ text: "OK", onPress: () => router.back() }]
      );
      return;
    }

    setSeverity(data.severity ?? "high");
    setStatus(normalizeStatus(data.status));
    setTitle(data.title ?? "");
    setDescription(data.description ?? "");
    setAddressText(data.address_text ?? "");
    setCity(data.city ?? "");
    setSupportRequired(data.support_required ?? "");

    setLoading(false);
  }

  async function saveChanges() {
    if (!params.id) return;

    if (!currentUserId) {
      Alert.alert("Not allowed", "Only the incident uploader can edit this record.");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter incident title.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("sira_incidents")
      .update({
        incident_type: "fiber_network_risk",
        severity,
        status,
        title: title.trim(),
        description: description.trim() || null,
        address_text: addressText.trim() || null,
        city: city.trim() || null,
        support_required: supportRequired.trim() || null,
      })
      .eq("id", params.id)
      .eq("incident_type", "fiber_network_risk")
      .eq("reporter_user_id", currentUserId);

    setSaving(false);

    if (error) {
      Alert.alert("Update failed", error.message);
      return;
    }

    Alert.alert("Updated", "Fiber Risk incident updated successfully.", [
      {
        text: "OK",
        // The incident screen reloads on focus, so going back shows the changes.
        onPress: () => router.back(),
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <SiraTopBar back />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1267e8" />
          <Text allowFontScaling={false} style={styles.loadingText}>
            Loading Fiber Risk incident...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SiraTopBar back />

      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Text allowFontScaling={false} style={styles.heading}>Edit Fiber Risk</Text>
        <Text allowFontScaling={false} style={styles.subheading}>
          Update the incident details and status.
        </Text>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Incident Type</Text>
          <View style={styles.fixedType}>
            <View style={styles.typeIcon}>
              <Ionicons name="git-network" size={21} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={styles.fixedTypeTitle}>Fiber Network Risk</Text>
              <Text allowFontScaling={false} style={styles.fixedTypeSubtitle}>
                SIRA is currently restricted to FR incidents only.
              </Text>
            </View>
            <Ionicons name="lock-closed" size={18} color="#64748b" />
          </View>
        </View>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Status</Text>
          <View style={styles.chipGrid}>
            {STATUSES.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.smallChip, status === item.key && styles.activeBlue]}
                onPress={() => setStatus(item.key)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.smallChipText, status === item.key && styles.whiteText]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Severity</Text>
          <View style={styles.chipGrid}>
            {SEVERITIES.map((item) => (
              <Pressable
                key={item}
                style={[styles.smallChip, severity === item && styles.activeBlue]}
                onPress={() => setSeverity(item)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.smallChipText, severity === item && styles.whiteText]}
                >
                  {item.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Details</Text>

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Incident title"
            placeholderTextColor="#94a3b8"
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Description / notes"
            placeholderTextColor="#94a3b8"
            multiline
          />

          <TextInput
            style={styles.input}
            value={addressText}
            onChangeText={setAddressText}
            placeholder="Location label"
            placeholderTextColor="#94a3b8"
          />

          <TextInput
            style={[styles.input, styles.supportArea]}
            placeholder="Support Required e.g. Fiber team visit, cable spare, transmission support"
            placeholderTextColor="#94a3b8"
            value={supportRequired}
            onChangeText={setSupportRequired}
            multiline
            textAlignVertical="top"
          />
        </View>

        <Pressable style={styles.saveButton} onPress={saveChanges} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={22} color="#ffffff" />
              <Text allowFontScaling={false} style={styles.saveText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" },
  page: { flex: 1 },
  content: { padding: 14, paddingBottom: 30, gap: 14 },
  heading: { color: "#0f172a", fontSize: 32, fontWeight: "900" },
  subheading: { color: "#64748b", fontSize: 13, fontWeight: "800", lineHeight: 19, marginTop: -8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#64748b", fontSize: 13, fontWeight: "800", marginTop: 10 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#dbe7f5",
  },
  cardTitle: { color: "#0f172a", fontSize: 17, fontWeight: "900", marginBottom: 11 },
  fixedType: {
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  fixedTypeTitle: { color: "#9a3412", fontSize: 14, fontWeight: "900" },
  fixedTypeSubtitle: { color: "#c2410c", fontSize: 10.5, fontWeight: "700", marginTop: 2 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallChip: {
    height: 39,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activeBlue: { backgroundColor: "#1267e8", borderColor: "#1267e8" },
  smallChipText: { color: "#334155", fontSize: 12, fontWeight: "900" },
  whiteText: { color: "#ffffff" },
  input: {
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "800",
    marginBottom: 10,
  },
  textArea: { minHeight: 95, textAlignVertical: "top" },
  supportArea: { minHeight: 150, textAlignVertical: "top" },
  saveButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: "#16b96f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  saveText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
});
