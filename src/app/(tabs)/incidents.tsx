import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SiraTopBar from "../../../components/SiraTopBar";
import { fetchAllRows } from "../../../lib/fetchAllRows";
import { formatCount, formatDateTime } from "../../../lib/format";
import { incidentPhotoCacheKey, storagePathFromIncidentPhoto, useIncidentPhotoUris } from "../../../lib/incidentPhotos";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

type Incident = {
  id: string;
  incident_type: string;
  severity: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  address_text: string | null;
  city: string | null;
  support_required: string | null;
  reported_by_name: string | null;
  reported_by_job_title: string | null;
  reported_by_company: string | null;
  reported_by_phone: string | null;
  photo_urls: string[] | null;
  status: string;
  created_at: string;
  reporter_user_id: string | null;
};

type IndexedIncident = {
  item: Incident;
  status: string;
  searchable: string;
};

const TYPES: Record<
  string,
  { label: string; prefix: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  fiber_network_risk: { label: "Fiber Risk", prefix: "FR", color: "#f97316", icon: "git-network" },
};

const STATUS_FILTERS = [
  ["all", "All"],
  ["open", "Open"],
  ["in_progress", "In Progress"],
  ["resolved", "Resolved"],
] as const;

const STATUS_COLORS: Record<string, { color: string; tint: string }> = {
  all: { color: "#1267e8", tint: "#eff6ff" },
  open: { color: "#dc2626", tint: "#fef2f2" },
  in_progress: { color: "#ea580c", tint: "#fff7ed" },
  resolved: { color: "#16a34a", tint: "#f0fdf4" },
};

const BANNER = require("../../../assets/images/sira-banner-dark.png");

function typeMeta(type: string) {
  return TYPES[type] ?? TYPES.fiber_network_risk;
}

function publicCode(item: Incident) {
  const digits = item.id.replace(/\D/g, "");
  return `${typeMeta(item.incident_type).prefix}-${digits.slice(-3).padStart(3, "0")}`;
}

function statusLabel(status: string) {
  if (status === "in_progress" || status === "under_review") return "In Progress";
  if (status === "resolved") return "Resolved";
  return "Open";
}

function normalizedStatusOf(status: string) {
  if (status === "submitted" || status === "draft") return "open";
  if (status === "under_review") return "in_progress";
  return status;
}

function severityLabel(severity: string) {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "low") return "Low";
  return "Medium";
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

export default function IncidentsScreen() {
  const router = useRouter();
  // The signed-in user comes from the local session; no network request.
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Typing stays responsive; filtering catches up a moment later.
  const deferredQuery = useDeferredValue(query);

  async function loadIncidents() {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from("sira_incidents")
        .select("*")
        .eq("incident_type", "fiber_network_risk")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (error) {
      Alert.alert("Load failed", error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setIncidents((data ?? []) as Incident[]);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadIncidents();
    }, [])
  );

  async function refresh() {
    setRefreshing(true);
    await loadIncidents();
  }

  async function deleteIncident(item: Incident) {
    if (
      !currentUserId ||
      !item.reporter_user_id ||
      item.reporter_user_id !== currentUserId
    ) {
      Alert.alert(
        "Not allowed",
        "Only the user who uploaded this incident can delete it."
      );
      return;
    }

    Alert.alert("Delete incident", `Delete ${publicCode(item)} and its images?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const imagePaths = (item.photo_urls ?? [])
            .map((url) => storagePathFromIncidentPhoto(String(url)))
            .filter(Boolean) as string[];

          if (imagePaths.length > 0) {
            const { error: storageError } = await supabase.storage
              .from("incident-photos")
              .remove(imagePaths);

            if (storageError) {
              Alert.alert("Image delete failed", storageError.message);
              return;
            }
          }

          const { error, count } = await supabase
            .from("sira_incidents")
            .delete({ count: "exact" })
            .eq("id", item.id)
            .eq("incident_type", "fiber_network_risk")
            .eq("reporter_user_id", currentUserId);

          if (error) {
            Alert.alert("Delete failed", error.message);
            return;
          }

          if (count === 0) {
            Alert.alert(
              "Delete failed",
              "This incident was not deleted because you are not its uploader."
            );
            return;
          }

          setIncidents((prev) =>
            prev.filter((incident) => incident.id !== item.id)
          );
        },
      },
    ]);
  }

  // Search text is built once per load, not on every keystroke.
  const indexed = useMemo<IndexedIncident[]>(
    () =>
      incidents.map((item) => ({
        item,
        status: normalizedStatusOf(item.status),
        searchable: normalizeSearch([
          publicCode(item),
          publicCode(item).replace("-", ""),
          item.id,
          item.title,
          item.description,
          typeMeta(item.incident_type).label,
          item.address_text,
          item.city,
          item.support_required,
          item.reported_by_name,
          item.reported_by_job_title,
          item.reported_by_company,
          item.reported_by_phone,
          statusLabel(item.status),
          severityLabel(item.severity),
        ].join(" ")),
      })),
    [incidents]
  );

  const filtered = useMemo(() => {
    const terms = normalizeSearch(deferredQuery).split(/\s+/).filter(Boolean);

    return indexed
      .filter((entry) => {
        if (statusFilter !== "all" && statusFilter !== entry.status) return false;
        return terms.every((term) => entry.searchable.includes(term));
      })
      .map((entry) => entry.item);
  }, [indexed, deferredQuery, statusFilter]);

  const counts = useMemo(() => {
    const result = { open: 0, in_progress: 0, resolved: 0 };
    indexed.forEach((entry) => {
      if (entry.status in result) result[entry.status as keyof typeof result] += 1;
    });
    return result;
  }, [indexed]);

  const openIncident = useCallback(
    (id: string) => router.push(`/incident/${id}` as any),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Incident }) => (
      <IncidentCard
        item={item}
        canDelete={Boolean(currentUserId) && item.reporter_user_id === currentUserId}
        onOpen={openIncident}
        onDelete={deleteIncident}
      />
    ),
    // deleteIncident only depends on currentUserId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, openIncident]
  );

  const header = (
    <View>
      <Image
        source={BANNER}
        style={styles.banner}
        contentFit="cover"
        accessibilityLabel="SIRA Smart Incident Reporting: Network Visibility, Fiber Risk Monitoring, Field Operations"
      />

      <View style={styles.titleBlock}>
        <Text allowFontScaling={false} style={styles.heading}>Fiber Risk Incidents</Text>
        <Text allowFontScaling={false} style={styles.subheading}>
          {formatCount(incidents.length)} total • {formatCount(counts.open)} open • {formatCount(counts.in_progress)} in progress
        </Text>
      </View>

      <View style={styles.statRow}>
        {STATUS_FILTERS.map(([key, label]) => {
          const active = statusFilter === key;
          const look = STATUS_COLORS[key];
          const count = key === "all" ? incidents.length : counts[key];
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show ${label}`}
              style={[styles.statCard, active && { borderColor: look.color, backgroundColor: look.tint }]}
              onPress={() => setStatusFilter(key)}
            >
              <View style={styles.statLabelRow}>
                {key === "all" ? (
                  <Ionicons name="layers" size={11} color={look.color} />
                ) : (
                  <View style={[styles.chipDot, { backgroundColor: look.color }]} />
                )}
                <Text allowFontScaling={false} numberOfLines={1} style={styles.statLabel}>{label}</Text>
              </View>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.statValue, active && { color: look.color }]}
              >
                {formatCount(count)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search FR ID, reporter or location"
          placeholderTextColor="#94a3b8"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable hitSlop={8} onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={19} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      {!loading && (query || statusFilter !== "all") ? (
        <Text allowFontScaling={false} style={styles.resultText}>
          Showing {formatCount(filtered.length)} of {formatCount(incidents.length)}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SiraTopBar />

      <FlatList
        style={styles.page}
        contentContainerStyle={styles.content}
        data={loading ? [] : filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#1267e8" />
              <Text allowFontScaling={false} style={styles.loadingText}>Loading incidents...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={36} color="#94a3b8" />
              <Text allowFontScaling={false} style={styles.emptyText}>No matching incidents</Text>
            </View>
          )
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        // Only cards near the screen are drawn, so long lists stay smooth.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a new incident"
        style={styles.fab}
        onPress={() => router.push({ pathname: "/(tabs)/report", params: { mode: "new", resetKey: Date.now().toString() } } as any)}
      >
        <Ionicons name="add" size={30} color="#ffffff" />
      </Pressable>
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={{ height: 10 }} />;
}

const IncidentCard = memo(function IncidentCard({
  item,
  canDelete,
  onOpen,
  onDelete,
}: {
  item: Incident;
  canDelete: boolean;
  onOpen: (id: string) => void;
  onDelete: (item: Incident) => void;
}) {
  const meta = typeMeta(item.incident_type);
  const location = item.address_text || item.city || "GPS selected location";
  const status = STATUS_COLORS[normalizedStatusOf(item.status)] ?? STATUS_COLORS.open;
  const severityColor =
    item.severity === "low" ? "#16a34a" : item.severity === "medium" ? "#f59e0b" : "#dc2626";
  const photoUrl = item.photo_urls?.find(Boolean) ?? null;
  // Signed on demand; cards that mount together share one request.
  const [photoUri] = useIncidentPhotoUris(photoUrl ? [String(photoUrl)] : []);

  return (
    <Pressable style={styles.card} onPress={() => onOpen(item.id)}>
      <View style={[styles.statusRail, { backgroundColor: status.color }]} />

      <View style={styles.thumbWrap}>
        {photoUrl && photoUri ? (
          <Image
            source={{ uri: photoUri, cacheKey: incidentPhotoCacheKey(String(photoUrl)) }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.id}
            transition={150}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name={meta.icon} size={24} color={meta.color} />
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.topLine}>
          <Text allowFontScaling={false} style={styles.code}>{publicCode(item)}</Text>

          <View style={styles.topBadges}>
            <View style={[styles.statusPill, { backgroundColor: status.tint }]}>
              <Text allowFontScaling={false} style={[styles.statusPillText, { color: status.color }]}>
                {statusLabel(item.status)}
              </Text>
            </View>
            <View style={styles.severityPill}>
              <View style={[styles.dot, { backgroundColor: severityColor }]} />
              <Text allowFontScaling={false} style={styles.severityText}>{severityLabel(item.severity)}</Text>
            </View>
          </View>

          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${publicCode(item)}`}
              hitSlop={8}
              style={styles.deleteBtn}
              onPress={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
            </Pressable>
          ) : null}
        </View>

        <Text allowFontScaling={false} numberOfLines={2} style={styles.cardTitle}>
          {item.title || meta.label}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaGrid}>
            <View style={styles.compactRow}>
              <Ionicons name="person-outline" size={12} color="#64748b" />
              <Text allowFontScaling={false} numberOfLines={1} style={styles.metaText}>
                {(item.reported_by_name || "Field User") + " • " + (item.reported_by_company || "Company")}
              </Text>
            </View>
            <View style={styles.compactRow}>
              <Ionicons name="call-outline" size={12} color="#64748b" />
              <Text allowFontScaling={false} numberOfLines={1} style={styles.metaText}>
                {item.reported_by_phone || "Mobile not added"}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${publicCode(item)}`}
            hitSlop={6}
            style={styles.viewBtn}
            onPress={(event) => {
              event.stopPropagation();
              onOpen(item.id);
            }}
          >
            <Ionicons name="eye-outline" size={18} color="#1267e8" />
          </Pressable>
        </View>

        <View style={styles.bottomLine}>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="#64748b" />
            <Text allowFontScaling={false} numberOfLines={1} style={styles.locationText}>
              {location}
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.dateText}>{formatDateTime(item.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" },
  page: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 96 },
  banner: { width: "100%", aspectRatio: 1086 / 362, borderRadius: 18, backgroundColor: "#e2e8f0" },
  titleBlock: { marginTop: 12, marginBottom: 10, paddingHorizontal: 2 },
  heading: { color: "#0f172a", fontSize: 22, lineHeight: 26, fontWeight: "900" },
  subheading: { color: "#64748b", fontSize: 11.5, fontWeight: "800", marginTop: 3 },
  statRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  statCard: {
    flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1.5, borderColor: "#e2e8f0",
    backgroundColor: "#ffffff", paddingHorizontal: 8, paddingVertical: 8,
  },
  statLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLabel: { flexShrink: 1, color: "#475569", fontSize: 10, fontWeight: "800" },
  statValue: { marginTop: 3, color: "#0f172a", fontSize: 18, fontWeight: "900" },
  fab: {
    position: "absolute", right: 16, bottom: 16, width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1267e8", alignItems: "center", justifyContent: "center",
    shadowColor: "#1267e8", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  searchBox: {
    height: 46, borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0",
    flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  searchInput: { flex: 1, color: "#0f172a", fontSize: 13, fontWeight: "700", paddingVertical: 0 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  resultText: { color: "#64748b", fontSize: 11, fontWeight: "800", marginBottom: 8 },
  loadingBox: { padding: 30, alignItems: "center" },
  loadingText: { color: "#64748b", fontSize: 13, fontWeight: "800", marginTop: 10 },
  emptyBox: { padding: 34, alignItems: "center" },
  emptyText: { color: "#64748b", fontSize: 14, fontWeight: "900", marginTop: 8 },
  card: {
    flexDirection: "row", backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#0f172a", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statusRail: { width: 4 },
  thumbWrap: { paddingLeft: 10, paddingVertical: 10 },
  thumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: "#e2e8f0" },
  thumbEmpty: { backgroundColor: "#fff7ed", alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 10 },
  topLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  code: { color: "#0f172a", fontSize: 14.5, fontWeight: "900" },
  topBadges: { flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 7 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, height: 22, alignItems: "center", justifyContent: "center" },
  statusPillText: { fontSize: 10, fontWeight: "900" },
  severityPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  severityText: { color: "#334155", fontSize: 10, fontWeight: "800" },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "#fef2f2",
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { color: "#0f172a", fontSize: 13.5, fontWeight: "900", marginTop: 7, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  metaGrid: { flex: 1, minWidth: 0, gap: 3 },
  viewBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: "#eff6ff",
    alignItems: "center", justifyContent: "center",
  },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "#475569", fontSize: 11, fontWeight: "700", flex: 1 },
  bottomLine: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7, paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e2e8f0",
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  locationText: { color: "#64748b", fontSize: 10.5, fontWeight: "700", flex: 1 },
  dateText: { color: "#94a3b8", fontSize: 10, fontWeight: "800" },
});
