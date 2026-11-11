import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useIsSiraAdmin } from "../../../components/SiraAdminShortcut";
import SiraTopBar from "../../../components/SiraTopBar";
import { fetchAllRows } from "../../../lib/fetchAllRows";
import { formatCount } from "../../../lib/format";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

type MyStats = { total: number; open: number; resolved: number };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function MoreScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [stats, setStats] = useState<MyStats | null>(null);
  const [editingJob, setEditingJob] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const email = String(user?.email ?? "").trim();
  const isAdmin = useIsSiraAdmin(user?.id);
  const name = profile?.full_name || "SIRA User";
  const currentJob = profile?.job_title || profile?.role || "";
  const version = Constants.expoConfig?.version ?? "1.0.0";

  useEffect(() => {
    setJobTitle(currentJob);
  }, [currentJob]);

  // Counts of incidents this user reported, refreshed whenever the tab opens.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let active = true;
      (async () => {
        const { data, error } = await fetchAllRows((from, to) =>
          supabase
            .from("sira_incidents")
            .select("id, status")
            .eq("incident_type", "fiber_network_risk")
            .eq("reporter_user_id", user.id)
            .order("id")
            .range(from, to)
        );
        if (!active || error) return;
        const rows = (data ?? []) as Array<{ status: string | null }>;
        setStats({
          total: rows.length,
          resolved: rows.filter((row) => row.status === "resolved").length,
          open: rows.filter((row) => row.status !== "resolved" && row.status !== "in_progress" && row.status !== "under_review").length,
        });
      })();
      return () => { active = false; };
    }, [user?.id])
  );

  async function saveJobTitle() {
    const value = jobTitle.trim();
    if (!user?.id || !profile) {
      Alert.alert("Profile unavailable", "Please log out and log in again.");
      return;
    }
    if (!value) {
      Alert.alert("Job title required", "Please enter your job title or designation.");
      return;
    }

    setSaving(true);
    const { error: profileError } = await supabase
      .from("sira_user_profiles")
      .update({ job_title: value, role: value })
      .eq("id", user.id);

    if (profileError) {
      setSaving(false);
      Alert.alert("Update failed", profileError.message);
      return;
    }

    // Keep the reporter's job title on their earlier incidents in step.
    const { error: incidentError } = await supabase
      .from("sira_incidents")
      .update({ reported_by_job_title: value })
      .eq("incident_type", "fiber_network_risk")
      .eq("reporter_user_id", user.id);

    await refreshProfile();
    setSaving(false);
    setEditingJob(false);

    if (incidentError) {
      Alert.alert("Profile updated", "Your job title was saved, but older incidents could not be updated: " + incidentError.message);
    }
  }

  function confirmLogout() {
    Alert.alert("Log out?", "You will need to sign in again to use SIRA.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/auth" as any);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SiraTopBar />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.cover} />
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text allowFontScaling={false} style={styles.avatarText}>{initials(name)}</Text>
            </View>
          </View>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>{name}</Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.role}>{currentJob || "Add your job title"}</Text>
          {profile?.company ? (
            <View style={styles.companyPill}>
              <Ionicons name="business-outline" size={12} color="#1267e8" />
              <Text allowFontScaling={false} style={styles.companyText}>{profile.company}</Text>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <Stat label="Reported" value={stats?.total} />
            <View style={styles.statDivider} />
            <Stat label="Open" value={stats?.open} />
            <View style={styles.statDivider} />
            <Stat label="Resolved" value={stats?.resolved} />
          </View>
        </View>

        <Text allowFontScaling={false} style={styles.sectionLabel}>Account</Text>
        <View style={styles.group}>
          <Row icon="person-outline" label="Full name" value={name} />
          <Row icon="mail-outline" label="Email" value={email || "Not available"} />
          <Row icon="call-outline" label="Mobile" value={profile?.mobile_number || "Not added"} />
          <Row icon="business-outline" label="Company" value={profile?.company || "Not set"} />
          <Row
            icon="briefcase-outline"
            label="Job title"
            value={currentJob || "Add"}
            onPress={() => { setJobTitle(currentJob); setEditingJob(true); }}
          />
          <Row
            icon="key-outline"
            label="Password"
            value="Change"
            onPress={() => router.push("/change-password" as never)}
            last
          />
        </View>

        <Text allowFontScaling={false} style={styles.sectionLabel}>App</Text>
        <View style={styles.group}>
          {isAdmin ? (
            <Row icon="shield-checkmark-outline" label="Admin Console" value="Manage users" onPress={() => router.push("/admin-users" as never)} />
          ) : null}
          <Row icon="information-circle-outline" label="Version" value={version} last />
        </View>

        <Pressable style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={19} color="#dc2626" />
          <Text allowFontScaling={false} style={styles.logoutText}>Log out</Text>
        </Pressable>

        <Text allowFontScaling={false} style={styles.footer}>SIRA · Smart Incident Reporting</Text>
      </ScrollView>

      <Modal visible={editingJob} transparent animationType="fade" onRequestClose={() => setEditingJob(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={() => !saving && setEditingJob(false)}>
            <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
              <Text allowFontScaling={false} style={styles.dialogTitle}>Job title</Text>
              <Text allowFontScaling={false} style={styles.dialogText}>
                Shown on your profile and on incidents you have reported.
              </Text>
              <TextInput
                style={styles.input}
                value={jobTitle}
                onChangeText={setJobTitle}
                placeholder="e.g. Network Engineer"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveJobTitle}
              />
              <View style={styles.dialogActions}>
                <Pressable style={styles.cancelBtn} disabled={saving} onPress={() => setEditingJob(false)}>
                  <Text allowFontScaling={false} style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={saveJobTitle}>
                  {saving ? <ActivityIndicator color="#ffffff" /> : <Text allowFontScaling={false} style={styles.saveText}>Save</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.stat}>
      <Text allowFontScaling={false} style={styles.statValue}>{value === undefined ? "–" : formatCount(value)}</Text>
      <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, value, onPress, last }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && onPress && { backgroundColor: "#f8fafc" }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color="#1267e8" />
      </View>
      <Text allowFontScaling={false} style={styles.rowLabel}>{label}</Text>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.rowValue, onPress && { color: "#1267e8" }]}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color="#94a3b8" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" },
  content: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 40 },
  profileCard: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e8edf3",
    alignItems: "center", paddingBottom: 14, overflow: "hidden",
  },
  cover: { position: "absolute", top: 0, left: 0, right: 0, height: 68, backgroundColor: "#1267e8" },
  avatarRing: { marginTop: 26, width: 88, height: 88, borderRadius: 44, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#1267e8", fontSize: 28, fontWeight: "800" },
  name: { color: "#0f172a", fontSize: 19, fontWeight: "900", marginTop: 10, paddingHorizontal: 16 },
  role: { color: "#64748b", fontSize: 13, fontWeight: "600", marginTop: 2, paddingHorizontal: 16 },
  companyPill: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 9,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#eff6ff",
  },
  companyText: { color: "#1267e8", fontSize: 11.5, fontWeight: "800" },
  statsRow: {
    flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginTop: 16, marginHorizontal: 14,
    paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e2e8f0",
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: "#0f172a", fontSize: 18, fontWeight: "800" },
  statLabel: { color: "#64748b", fontSize: 11, fontWeight: "600", marginTop: 1 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: "#e2e8f0" },
  sectionLabel: { color: "#64748b", fontSize: 12, fontWeight: "800", marginTop: 20, marginBottom: 7, marginLeft: 4 },
  group: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#e8edf3", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 52, paddingHorizontal: 13 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef2f7" },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" },
  rowLabel: { color: "#0f172a", fontSize: 13.5, fontWeight: "700" },
  rowValue: { flex: 1, color: "#64748b", fontSize: 13, fontWeight: "600", textAlign: "right" },
  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 50, marginTop: 22,
    borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#fecaca",
  },
  logoutText: { color: "#dc2626", fontSize: 14, fontWeight: "800" },
  footer: { color: "#94a3b8", fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,.5)", justifyContent: "center", padding: 22 },
  dialog: { backgroundColor: "#ffffff", borderRadius: 20, padding: 18 },
  dialogTitle: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  dialogText: { color: "#64748b", fontSize: 12.5, fontWeight: "600", marginTop: 4 },
  input: {
    height: 50, marginTop: 14, borderRadius: 13, borderWidth: 1, borderColor: "#dbe7f5", backgroundColor: "#f8fafc",
    paddingHorizontal: 13, color: "#0f172a", fontSize: 15, fontWeight: "700",
  },
  dialogActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 13, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#334155", fontSize: 14, fontWeight: "800" },
  saveBtn: { flex: 1, height: 46, borderRadius: 13, backgroundColor: "#1267e8", alignItems: "center", justifyContent: "center" },
  saveText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
});
