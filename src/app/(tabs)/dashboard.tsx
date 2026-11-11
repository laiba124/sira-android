import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SiraTopBar from "../../../components/SiraTopBar";
import { fetchAllRows } from "../../../lib/fetchAllRows";
import { formatCount } from "../../../lib/format";
import { getSiraRegionName, inferSiraArea, SIRA_REGIONS } from "../../../lib/siraAreas";
import { supabase } from "../../../lib/supabase";

type DashboardIncident = {
  id: string;
  status: string | null;
  severity: string | null;
  created_at: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  address_text: string | null;
};

type Classified = {
  status: "open" | "in_progress" | "resolved";
  severity: "critical" | "high" | "medium" | "low";
  region: string;
  subRegion: string;
  district: string;
};

type Segment = { key: string; label: string; count: number; color: string };

const INK = { primary: "#0f172a", secondary: "#475569", muted: "#64748b", faint: "#94a3b8" };
const SURFACE = "#ffffff";
const TRACK = "#eef2f7";
const BAR = "#2a78d6";

// Status colors match the Map page and stay reserved for status.
const STATUS = {
  open: { label: "Open", color: "#dc2626", caption: "Requires attention", icon: "alert-circle" },
  in_progress: { label: "In Progress", color: "#ea580c", caption: "Being handled", icon: "time" },
  resolved: { label: "Resolved", color: "#16a34a", caption: "Closed incidents", icon: "checkmark-circle" },
} as const;

const SEVERITY = [
  { key: "critical", label: "Critical", color: "#e35d5d" },
  { key: "high", label: "High", color: "#f4a261" },
  { key: "medium", label: "Medium", color: "#f2cc60" },
  { key: "low", label: "Low", color: "#7cc8a4" },
] as const;

// Validated categorical slots 1-3; each region keeps its color whatever the counts.
const REGION_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a"];
const REGION_NAMES = SIRA_REGIONS.map((item) => item.name);
const REGION_COLOR: Record<string, string> = Object.fromEntries(
  REGION_NAMES.map((name, index) => [name, REGION_PALETTE[index] ?? "#94a3b8"])
);
const UNMAPPED = "Unmapped";

function pct(part: number, total: number) {
  if (!total) return "0%";
  const value = (part / total) * 100;
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

function statusKey(status: string | null): Classified["status"] {
  if (status === "resolved") return "resolved";
  if (status === "in_progress" || status === "under_review") return "in_progress";
  return "open";
}

function severityKey(severity: string | null): Classified["severity"] {
  if (severity === "critical" || severity === "high" || severity === "low") return severity;
  return "medium";
}

function rank(items: Classified[], pick: (item: Classified) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = pick(item);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export default function DashboardScreen() {
  const [rows, setRows] = useState<DashboardIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [showAllSubRegions, setShowAllSubRegions] = useState(false);

  const loadDashboard = useCallback(async () => {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from("sira_incidents")
        .select("id, status, severity, created_at, latitude, longitude, city, address_text")
        .eq("incident_type", "fiber_network_risk")
        .order("id")
        .range(from, to)
    );

    if (error) Alert.alert("Dashboard could not load", error.message);
    else setRows((data ?? []) as DashboardIncident[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  async function refresh() {
    setRefreshing(true);
    await loadDashboard();
  }

  // Area tagging works the same way as the Map page filters.
  const classified = useMemo<Classified[]>(
    () => rows.map((row) => {
      const area = inferSiraArea(row);
      return {
        status: statusKey(row.status),
        severity: severityKey(row.severity),
        region: area ? getSiraRegionName(area.subRegion) : UNMAPPED,
        subRegion: area?.subRegion ?? "",
        district: area?.name ?? "",
      };
    }),
    [rows]
  );

  const scoped = useMemo(
    () => (region ? classified.filter((item) => item.region === region) : classified),
    [classified, region]
  );
  const total = scoped.length;

  const stats = useMemo(() => {
    const status = { open: 0, in_progress: 0, resolved: 0 };
    const severity = { critical: 0, high: 0, medium: 0, low: 0 };
    scoped.forEach((item) => {
      status[item.status] += 1;
      severity[item.severity] += 1;
    });
    return { status, severity };
  }, [scoped]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    classified.forEach((item) => { counts[item.region] = (counts[item.region] ?? 0) + 1; });
    return counts;
  }, [classified]);

  const subRegions = useMemo(() => rank(scoped, (item) => item.subRegion), [scoped]);
  const districts = useMemo(() => rank(scoped, (item) => item.district).slice(0, 5), [scoped]);

  const severitySegments: Segment[] = SEVERITY.map((item) => ({
    key: item.key, label: item.label, count: stats.severity[item.key], color: item.color,
  }));
  const regionSegments: Segment[] = [
    ...REGION_NAMES.map((name) => ({ key: name, label: name, count: regionCounts[name] ?? 0, color: REGION_COLOR[name] })),
    ...(regionCounts[UNMAPPED] ? [{ key: UNMAPPED, label: UNMAPPED, count: regionCounts[UNMAPPED], color: "#94a3b8" }] : []),
  ];

  const visibleSubRegions = showAllSubRegions ? subRegions : subRegions.slice(0, 5);
  const subRegionColor = region ? REGION_COLOR[region] ?? BAR : BAR;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SiraTopBar />

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.headingRow}>
          <Text allowFontScaling={false} style={[styles.heading, { flex: 1 }]}>Dashboard</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh dashboard"
            style={({ pressed }) => [styles.refreshButton, pressed && { opacity: .7 }]}
            onPress={refresh}
          >
            <Ionicons name="refresh" size={18} color="#1267e8" />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <RegionChip label="All Regions" count={classified.length} active={!region} onPress={() => setRegion(null)} />
          {REGION_NAMES.map((name) => (
            <RegionChip
              key={name}
              label={name}
              count={regionCounts[name] ?? 0}
              color={REGION_COLOR[name]}
              active={region === name}
              onPress={() => setRegion(region === name ? null : name)}
            />
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1267e8" />
            <Text allowFontScaling={false} style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard label="Total Incidents" value={total} color="#1267e8" icon="layers" />
              <KpiCard label="Open" value={stats.status.open} color={STATUS.open.color} icon={STATUS.open.icon} />
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard label="In Progress" value={stats.status.in_progress} color={STATUS.in_progress.color} icon={STATUS.in_progress.icon} />
              <KpiCard label="Resolved" value={stats.status.resolved} color={STATUS.resolved.color} icon={STATUS.resolved.icon} />
            </View>

            <Card title="Risk level">
              <View style={styles.pieRow}>
                <Donut segments={severitySegments} total={total} size={118} thickness={15}>
                  <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={styles.pieTotal}>{formatCount(total)}</Text>
                  <Text allowFontScaling={false} style={styles.pieCaption}>incidents</Text>
                </Donut>
                <View style={styles.pieLegend}>
                  {severitySegments.map((item) => (
                    <View key={item.key} style={styles.pieLegendRow}>
                      <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.pieLegendLabel}>{item.label}</Text>
                      <Text allowFontScaling={false} style={styles.pieLegendCount}>{formatCount(item.count)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            {!region ? (
              <Card title="Regions">
                <StackedBar segments={regionSegments} />
                <Legend segments={regionSegments} total={classified.length} onPress={(key) => key !== UNMAPPED && setRegion(key)} />
              </Card>
            ) : null}

            <Card title={region ? `${region} SubRegions` : "SubRegions"}>
              {subRegions.length ? (
                <>
                  <RankedBars items={visibleSubRegions} max={subRegions[0].count} total={total} color={subRegionColor} />
                  {subRegions.length > 5 ? (
                    <Pressable style={styles.moreButton} onPress={() => setShowAllSubRegions((v) => !v)}>
                      <Text allowFontScaling={false} style={styles.moreText}>
                        {showAllSubRegions ? "Show less" : `Show all ${subRegions.length}`}
                      </Text>
                      <Ionicons name={showAllSubRegions ? "chevron-up" : "chevron-down"} size={14} color="#1267e8" />
                    </Pressable>
                  ) : null}
                </>
              ) : <Empty />}
            </Card>

            <Card title="Top districts">
              {districts.length ? (
                <RankList items={districts} color={subRegionColor} />
              ) : <Empty />}
            </Card>

          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RegionChip({ label, color, active, onPress }: {
  label: string; count?: number; color?: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      {color ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      <Text allowFontScaling={false} style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function KpiCard({ label, value, color }: {
  label: string; value: number; color: string; icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiDot, { backgroundColor: color }]} />
        <Text allowFontScaling={false} numberOfLines={1} style={styles.kpiLabel}>{label}</Text>
      </View>
      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={styles.kpiValue}>
        {formatCount(value)}
      </Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Donut drawn with plain views: each slice (max 180°) is a half-disc rotated
// inside a half-width clip, so no chart or SVG library is needed.
function Donut({ segments, total, size, thickness, children }: {
  segments: Segment[]; total: number; size: number; thickness: number; children?: ReactNode;
}) {
  const half = size / 2;
  const slices: Array<{ key: string; color: string; start: number; sweep: number }> = [];
  const boundaries: number[] = [];
  let angle = 0;
  if (total > 0) {
    segments.filter((item) => item.count > 0).forEach((item) => {
      let remaining = (item.count / total) * 360;
      let start = angle;
      boundaries.push(angle);
      while (remaining > 0.01) {
        const sweep = Math.min(180, remaining);
        slices.push({ key: item.key + "-" + start, color: item.color, start, sweep });
        start += sweep;
        remaining -= sweep;
      }
      angle += (item.count / total) * 360;
    });
  }

  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: half, backgroundColor: TRACK }]} />
      {slices.map((slice) => (
        <View key={slice.key} style={{ position: "absolute", width: size, height: size, transform: [{ rotate: slice.start + "deg" }] }}>
          <View style={{ position: "absolute", left: half, width: half, height: size, overflow: "hidden" }}>
            <View style={{ position: "absolute", left: -half, width: size, height: size, transform: [{ rotate: slice.sweep + "deg" }] }}>
              <View style={{ width: half, height: size, backgroundColor: slice.color, borderTopLeftRadius: half, borderBottomLeftRadius: half }} />
            </View>
          </View>
        </View>
      ))}
      {boundaries.length > 1 ? boundaries.map((deg) => (
        <View key={"gap-" + deg} style={{ position: "absolute", width: size, height: size, transform: [{ rotate: deg + "deg" }] }}>
          <View style={{ position: "absolute", left: half - 1, top: 0, width: 2, height: half, backgroundColor: SURFACE }} />
        </View>
      )) : null}
      <View style={{
        position: "absolute", left: thickness, top: thickness, width: size - thickness * 2, height: size - thickness * 2,
        borderRadius: half, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
      }}>
        {children}
      </View>
    </View>
  );
}

// Thin bar split by share, with a 2px surface gap between segments.
function StackedBar({ segments }: { segments: Segment[] }) {
  const visible = segments.filter((item) => item.count > 0);
  return (
    <View style={styles.stack}>
      {visible.length ? visible.map((item) => (
        <View key={item.key} style={{ flex: item.count, backgroundColor: item.color, borderRadius: 3, minWidth: 3 }} />
      )) : <View style={{ flex: 1, backgroundColor: TRACK, borderRadius: 3 }} />}
    </View>
  );
}

function Legend({ segments, total, onPress }: { segments: Segment[]; total: number; onPress?: (key: string) => void }) {
  return (
    <View style={{ marginTop: 6 }}>
      {segments.map((item, index) => (
        <Pressable
          key={item.key}
          disabled={!onPress || item.key === UNMAPPED}
          onPress={() => onPress?.(item.key)}
          style={[styles.legendRow, index === segments.length - 1 && { borderBottomWidth: 0 }]}
        >
          <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
          <Text allowFontScaling={false} numberOfLines={1} style={styles.legendLabel}>{item.label}</Text>
          <Text allowFontScaling={false} style={styles.legendCount}>{formatCount(item.count)}</Text>
          <Text allowFontScaling={false} style={styles.legendPct}>{pct(item.count, total)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Numbered leaderboard, so districts read differently from the SubRegion bars.
function RankList({ items, color }: { items: Array<{ label: string; count: number }>; color: string }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.rankRow, index === items.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={[styles.rankBadge, index === 0 && { backgroundColor: color }]}>
            <Text allowFontScaling={false} style={[styles.rankBadgeText, index === 0 && { color: "#ffffff" }]}>{index + 1}</Text>
          </View>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.rankName}>{item.label}</Text>
          <Text allowFontScaling={false} style={styles.rankValue}>{formatCount(item.count)}</Text>
        </View>
      ))}
    </View>
  );
}

function RankedBars({ items, max, total, color }: {
  items: Array<{ label: string; count: number }>; max: number; total: number; color: string;
}) {
  return (
    <View style={{ gap: 9, marginTop: 4 }}>
      {items.map((item) => (
        <View key={item.label} accessibilityLabel={`${item.label}: ${item.count} incidents`}>
          <View style={styles.rankTop}>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.rankLabel}>{item.label}</Text>
            <Text allowFontScaling={false} style={styles.rankCount}>{formatCount(item.count)}</Text>
            <Text allowFontScaling={false} style={styles.rankPct}>{pct(item.count, total)}</Text>
          </View>
          <View style={styles.rankTrack}>
            <View style={[styles.rankFill, { width: `${Math.max(2, (item.count / Math.max(1, max)) * 100)}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <Ionicons name="map-outline" size={22} color={INK.faint} />
      <Text allowFontScaling={false} style={styles.emptyText}>No area data yet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" },
  page: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 28, gap: 10 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { color: INK.primary, fontSize: 21, fontWeight: "900" },
  refreshButton: {
    width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: "#bfdbfe",
    backgroundColor: SURFACE, alignItems: "center", justifyContent: "center",
  },
  chipRow: { gap: 7, paddingVertical: 2 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 13,
    borderRadius: 999, backgroundColor: SURFACE, borderWidth: 1, borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#1267e8", borderColor: "#1267e8" },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: INK.primary, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#ffffff" },
  loadingBox: { minHeight: 320, alignItems: "center", justifyContent: "center" },
  loadingText: { color: INK.muted, fontSize: 13, fontWeight: "800", marginTop: 10 },
  kpiGrid: { flexDirection: "row", gap: 10 },
  kpiCard: {
    flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, borderColor: "#e8edf3", backgroundColor: SURFACE,
    paddingHorizontal: 12, paddingTop: 11, paddingBottom: 10, overflow: "hidden",
  },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiDot: { width: 7, height: 7, borderRadius: 4 },
  kpiLabel: { flex: 1, color: INK.primary, fontSize: 11.5, fontWeight: "800" },
  kpiValue: { color: INK.primary, fontSize: 21, fontWeight: "600", marginTop: 4 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: "#e8edf3", backgroundColor: SURFACE, padding: 14 },
  cardTitle: { color: INK.primary, fontSize: 14.5, fontWeight: "900", marginBottom: 12 },
  pieRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  pieTotal: { color: INK.primary, fontSize: 18, fontWeight: "800" },
  pieCaption: { color: INK.faint, fontSize: 9.5, fontWeight: "700" },
  pieLegend: { flex: 1, minWidth: 0, gap: 9 },
  pieLegendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  pieLegendLabel: { flex: 1, color: INK.secondary, fontSize: 12.5, fontWeight: "700" },
  pieLegendCount: { color: INK.primary, fontSize: 12.5, fontWeight: "800" },
  stack: { flexDirection: "row", gap: 2, height: 6 },
  legendRow: {
    flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef2f7",
  },
  legendLabel: { flex: 1, color: INK.primary, fontSize: 13, fontWeight: "700" },
  legendCount: { color: INK.primary, fontSize: 13, fontWeight: "800", minWidth: 44, textAlign: "right" },
  legendPct: { color: INK.faint, fontSize: 11.5, fontWeight: "700", minWidth: 40, textAlign: "right" },
  rankRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef2f7",
  },
  rankBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  rankBadgeText: { color: INK.secondary, fontSize: 11, fontWeight: "800" },
  rankName: { flex: 1, color: INK.primary, fontSize: 13, fontWeight: "700" },
  rankValue: { color: INK.primary, fontSize: 13, fontWeight: "800" },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
  rankTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  rankLabel: { flex: 1, color: INK.primary, fontSize: 12.5, fontWeight: "800" },
  rankCount: { color: INK.primary, fontSize: 12.5, fontWeight: "900" },
  rankPct: { color: INK.muted, fontSize: 11, fontWeight: "800", minWidth: 38, textAlign: "right" },
  rankTrack: { height: 6, borderRadius: 4, backgroundColor: TRACK, overflow: "hidden" },
  rankFill: { height: "100%", borderRadius: 4 },
  moreButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#eff6ff" },
  moreText: { color: "#1267e8", fontSize: 12, fontWeight: "900" },
  empty: { alignItems: "center", paddingVertical: 18, gap: 6 },
  emptyText: { color: INK.muted, fontSize: 12, fontWeight: "800" },
});
