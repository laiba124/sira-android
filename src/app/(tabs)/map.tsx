import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";

import SiraTopBar from "../../../components/SiraTopBar";
import {
  getSiraDistricts,
  getSiraRegion,
  getSiraRegionName,
  getSiraSubRegionBounds,
  inferSiraArea,
  normalizeSiraAreaText,
  SIRA_REGIONS,
  SIRA_SUBREGIONS,
} from "../../../lib/siraAreas";
import type { SiraAreaBounds, SiraDistrict, SiraSubRegion } from "../../../lib/siraAreas";
import { fetchAllRows } from "../../../lib/fetchAllRows";
import { safeJsonForHtml } from "../../../lib/safeJson";
import { supabase } from "../../../lib/supabase";

type Incident = {
  id: string;
  incident_type: string;
  severity: string;
  status: string;
  title: string;
  latitude: number;
  longitude: number;
  address_text: string | null;
  city: string | null;
  reported_by_name: string | null;
  reported_by_company: string | null;
  reported_by_phone: string | null;
};

type FilterMode = "region" | "subregion" | "district" | null;
type StatusFilter = "all" | "open" | "in_progress" | "resolved";
type ClassifiedIncident = { incident: Incident; area: SiraDistrict | null };

type FilterOption = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onSelect: () => void;
};

function formatCount(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function operationalStatus(status: string) {
  const value = String(status ?? "").toLowerCase();
  if (value === "resolved") return "resolved";
  if (value === "in_progress" || value === "under_review") return "in_progress";
  return "open";
}

function markerColor(status: string) {
  const normalized = operationalStatus(status);
  if (normalized === "resolved") return "#16a34a";
  if (normalized === "in_progress") return "#f97316";
  return "#dc2626";
}

function statusLabel(status: string) {
  const normalized = operationalStatus(status);
  if (normalized === "resolved") return "Resolved";
  if (normalized === "in_progress") return "In Progress";
  return "Open";
}

function htmlForMap(incidents: Incident[]) {
  const markers = incidents
    .filter(
      (item) =>
        Number.isFinite(Number(item.latitude)) &&
        Number.isFinite(Number(item.longitude))
    )
    .map((item) => ({
      id: item.id,
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      color: markerColor(item.status),
      status: statusLabel(item.status),
      title: item.title ?? "Fiber Risk Incident",
      location: item.address_text ?? item.city ?? "GPS selected location",
      reporter: `${item.reported_by_name ?? "Field User"} • ${item.reported_by_company ?? "Company"}`,
      phone: item.reported_by_phone ?? "",
    }));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; width: 100%; padding: 0; margin: 0; overflow: hidden; background: #e8eef7; }
    .leaflet-control-attribution { font-size: 8px !important; }
    .leaflet-bottom.leaflet-right { bottom: 84px; }
    .leaflet-control-zoom { border: 0 !important; border-radius: 12px !important; overflow: hidden; box-shadow: 0 5px 16px rgba(15,23,42,.22) !important; }
    .leaflet-control-zoom a { width: 40px !important; height: 40px !important; line-height: 40px !important; font-size: 20px !important; color: #0f172a !important; }
    .leaflet-control-layers { border: 0 !important; border-radius: 12px !important; box-shadow: 0 5px 16px rgba(15,23,42,.22) !important; font-size: 12px !important; font-weight: 800 !important; color: #0f172a !important; }
    .leaflet-control-layers-toggle { width: 40px !important; height: 40px !important; background-size: 22px 22px !important; }
    .leaflet-control-layers-expanded { padding: 7px 9px !important; background: rgba(255,255,255,.97) !important; }
    .popup-title { max-width: 220px; font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 4px; }
    .popup-status { display: inline-block; color: #fff; border-radius: 8px; padding: 4px 8px; font-size: 10px; font-weight: 800; margin-bottom: 5px; }
    .popup-line { max-width: 220px; font-size: 11px; color: #475569; margin-top: 2px; }
    .popup-button { width: 100%; margin-top: 9px; padding: 8px 10px; border: 0; border-radius: 9px; background: #1267e8; color: #fff; font-size: 11px; font-weight: 800; }

    /* Single incident pin */
    .sira-pin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 7px rgba(15,23,42,.35); }

    /* Cluster bubble: a ring split by status share, white core with the count */
    .sira-cluster { background: transparent; border: 0; }
    .sira-cluster-ring {
      width: 100%; height: 100%; border-radius: 50%; padding: 4px; box-sizing: border-box;
      box-shadow: 0 4px 14px rgba(15,23,42,.28), 0 0 0 5px rgba(255,255,255,.55);
      transition: transform .15s ease;
    }
    .sira-cluster-core {
      width: 100%; height: 100%; border-radius: 50%; background: #fff;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, Roboto, "Segoe UI", sans-serif;
      color: #0f172a; font-weight: 900; letter-spacing: -.3px;
    }
    .leaflet-marker-icon.sira-cluster:active .sira-cluster-ring { transform: scale(.93); }
  </style>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    const markers = ${safeJsonForHtml(markers)};
    const map = L.map("map", { zoomControl: false, attributionControl: false, preferCanvas: true }).setView([30.3753, 69.3451], 5);
    L.control.attribution({ position: "bottomleft" }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    });

    const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles © Esri"
    });

    streetLayer.addTo(map);

    L.control.layers(
      { "Map": streetLayer, "Satellite": satelliteLayer },
      null,
      { position: "bottomright", collapsed: true }
    ).addTo(map);

    const allBounds = [];

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    window.openSiraIncident = function(id) {
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "SIRA_OPEN_INCIDENT", id: id }));
    };

    const STATUS_COLORS = { open: "#dc2626", progress: "#f97316", resolved: "#16a34a" };

    // Exact count with a thousands separator: 1317 -> "1,317".
    function clusterLabel(n) {
      return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
    }

    // Bubble grows with the log of the count, so 10, 100 and 1,000 are
    // clearly different sizes without large clusters swallowing the map.
    function clusterSize(n) {
      return Math.round(Math.min(64, Math.max(34, 34 + 8 * Math.log10(n))));
    }

    // Ring segments sized by the share of open / in progress / resolved
    // incidents inside the cluster.
    function clusterIcon(cluster) {
      const children = cluster.getAllChildMarkers();
      const tally = { open: 0, progress: 0, resolved: 0 };
      children.forEach(function(m) { tally[m.options.siraStatus] += 1; });
      const total = children.length;
      const a = (tally.open / total) * 360;
      const b = a + (tally.progress / total) * 360;
      const ring = "conic-gradient(" +
        STATUS_COLORS.open + " 0deg " + a + "deg, " +
        STATUS_COLORS.progress + " " + a + "deg " + b + "deg, " +
        STATUS_COLORS.resolved + " " + b + "deg 360deg)";
      const label = clusterLabel(total);
      const size = clusterSize(total);
      const font = label.length >= 5 ? 12 : label.length === 4 ? 13 : 14;
      return L.divIcon({
        className: "sira-cluster",
        iconSize: [size, size],
        html: '<div class="sira-cluster-ring" style="background:' + ring + '">' +
              '<div class="sira-cluster-core" style="font-size:' + font + 'px">' + label + '</div></div>'
      });
    }

    const clusterLayer = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      spiderLegPolylineOptions: { weight: 1.5, color: "#1267e8", opacity: .6 },
      animate: true,
      chunkedLoading: true,
      // Points within this many screen pixels merge. Smaller radius once
      // zoomed in, so city-level groups split into streets quickly.
      maxClusterRadius: function(zoom) { return zoom <= 8 ? 50 : zoom <= 12 ? 45 : 35; },
      // At max zoom, points on the same spot fan out a little wider.
      spiderfyDistanceMultiplier: 1.4,
    });
    map.addLayer(clusterLayer);

    function statusKey(color) {
      return color === STATUS_COLORS.resolved ? "resolved" : color === STATUS_COLORS.progress ? "progress" : "open";
    }

    markers.forEach(function(item) {
      const marker = L.marker([item.lat, item.lng], {
        siraStatus: statusKey(item.color),
        icon: L.divIcon({
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -10],
          html: '<div class="sira-pin" style="background:' + item.color + '"></div>'
        })
      });
      clusterLayer.addLayer(marker);
      const buttonId = "open-incident-" + item.id;
      marker.bindPopup(
        '<div class="popup-status" style="background:' + item.color + '">' + escapeHtml(item.status) + '</div>' +
        '<div class="popup-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="popup-line">' + escapeHtml(item.location) + '</div>' +
        '<div class="popup-line">' + escapeHtml(item.reporter) + '</div>' +
        '<div class="popup-line">' + escapeHtml(item.phone) + '</div>' +
        '<button id="' + buttonId + '" class="popup-button">View incident</button>'
      );
      marker.on("popupopen", function() {
        const button = document.getElementById(buttonId);
        if (button) button.onclick = function() { window.openSiraIncident(item.id); };
      });
      allBounds.push([item.lat, item.lng]);
    });

    window.siraResetMap = function() {
      if (allBounds.length > 1) map.fitBounds(allBounds, { padding: [35,35], maxZoom: 15 });
      else if (allBounds.length === 1) map.setView(allBounds[0], 14);
      else map.setView([30.3753, 69.3451], 5);
    };

    // Zoom to the incidents that match the filter; the area box is only used
    // when the selection has none.
    window.siraFocusArea = function(south, west, north, east) {
      if (allBounds.length) {
        map.fitBounds(allBounds, { padding: [42,42], maxZoom: 14, animate: true, duration: .8 });
      } else {
        map.fitBounds([[south, west], [north, east]], { padding: [42,42], maxZoom: 13, animate: true, duration: .8 });
      }
    };

    window.siraResetMap();
    setTimeout(function() { map.invalidateSize(); }, 300);
  </script>
</body>
</html>`;
}

export default function MapScreen() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedSubRegion, setSelectedSubRegion] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<SiraDistrict | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadIncidents = useCallback(async () => {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from("sira_incidents")
        .select("*")
        .eq("incident_type", "fiber_network_risk")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (error) Alert.alert("Map could not load", error.message);
    else setIncidents((data ?? []) as Incident[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadIncidents(); }, [loadIncidents]));

  const classified = useMemo<ClassifiedIncident[]>(
    () => incidents.map((incident) => ({ incident, area: inferSiraArea(incident) })),
    [incidents]
  );

  const visibleIncidents = useMemo(
    () => classified.filter(({ area }) => {
      if (selectedDistrict) {
        return normalizeSiraAreaText(area?.subRegion) === normalizeSiraAreaText(selectedDistrict.subRegion)
          && normalizeSiraAreaText(area?.name) === normalizeSiraAreaText(selectedDistrict.name);
      }
      if (selectedSubRegion) {
        return normalizeSiraAreaText(area?.subRegion) === normalizeSiraAreaText(selectedSubRegion);
      }
      if (selectedRegion) {
        return normalizeSiraAreaText(getSiraRegionName(area?.subRegion)) === normalizeSiraAreaText(selectedRegion);
      }
      return true;
    }).map(({ incident }) => incident),
    [classified, selectedDistrict, selectedSubRegion, selectedRegion]
  );

  const subRegionOptions = useMemo(
    () => selectedRegion ? getSiraRegion(selectedRegion)?.subRegions ?? [] : SIRA_SUBREGIONS,
    [selectedRegion]
  );
  const districtOptions = useMemo(() => getSiraDistricts(selectedSubRegion), [selectedSubRegion]);
  const modalOptions = useMemo<FilterOption[]>(() => {
    const query = normalizeSiraAreaText(filterSearch);
    if (filterMode === "region") {
      return SIRA_REGIONS
        .filter((item) => normalizeSiraAreaText(item.name).includes(query))
        .map((item) => ({
          key: item.name,
          title: item.name,
          subtitle: `${item.subRegions.length} SubRegions • ${item.districtCount} districts`,
          icon: "globe-outline",
          selected: normalizeSiraAreaText(selectedRegion) === normalizeSiraAreaText(item.name),
          onSelect: () => selectRegion(item.name),
        }));
    }
    if (filterMode === "subregion") {
      return subRegionOptions
        .filter((item) => normalizeSiraAreaText(item.name).includes(query))
        .map((item) => ({
          key: item.name,
          title: item.name,
          subtitle: `${item.districts.length} districts`,
          icon: "layers-outline",
          selected: normalizeSiraAreaText(selectedSubRegion) === normalizeSiraAreaText(item.name),
          onSelect: () => selectSubRegion(item),
        }));
    }
    return districtOptions
      .filter((item) => normalizeSiraAreaText(`${item.name} ${item.province}`).includes(query))
      .map((item) => ({
        key: `${item.subRegion}-${item.name}`,
        title: item.name,
        subtitle: item.province,
        icon: "location-outline",
        selected: normalizeSiraAreaText(selectedDistrict?.name) === normalizeSiraAreaText(item.name)
          && normalizeSiraAreaText(selectedDistrict?.subRegion) === normalizeSiraAreaText(item.subRegion),
        onSelect: () => selectDistrict(item),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, filterSearch, subRegionOptions, districtOptions, selectedRegion, selectedSubRegion, selectedDistrict]);

  // Stat cards narrow the map by status; their counts stay area-wide.
  const mapIncidents = useMemo(
    () => statusFilter === "all"
      ? visibleIncidents
      : visibleIncidents.filter((incident) => operationalStatus(incident.status) === statusFilter),
    [visibleIncidents, statusFilter]
  );

  const html = useMemo(() => htmlForMap(mapIncidents), [mapIncidents]);
  // Stable source object so a re-render never reloads the map page.
  const webSource = useMemo(() => ({ html }), [html]);

  // Rebuild the Leaflet WebView whenever either filter changes.
  // This ensures marker filtering and map zoom happen immediately.
  const mapRenderKey = useMemo(
    () =>
      [
        selectedRegion ?? "ALL_REGIONS",
        selectedSubRegion ?? "ALL_SUBREGIONS",
        selectedDistrict?.subRegion ?? "",
        selectedDistrict?.name ?? "ALL_DISTRICTS",
        statusFilter,
        mapIncidents
          .map(
            (incident) =>
              `${incident.id}:${incident.status}:${incident.latitude}:${incident.longitude}`
          )
          .join(","),
      ].join("|"),
    [
      selectedRegion,
      selectedSubRegion,
      selectedDistrict?.subRegion,
      selectedDistrict?.name,
      statusFilter,
      mapIncidents,
    ]
  );
  const statusCounts = useMemo(() => {
    let open = 0, progress = 0, resolved = 0;
    visibleIncidents.forEach((incident) => {
      const status = operationalStatus(incident.status);
      if (status === "resolved") resolved += 1;
      else if (status === "in_progress") progress += 1;
      else open += 1;
    });
    return { open, progress, resolved };
  }, [visibleIncidents]);

  const selectedArea = useMemo<SiraAreaBounds | null>(() => {
    if (selectedDistrict) return selectedDistrict;
    if (selectedSubRegion) return getSiraSubRegionBounds(selectedSubRegion);
    if (selectedRegion) return getSiraRegion(selectedRegion);
    return null;
  }, [selectedDistrict, selectedSubRegion, selectedRegion]);

  const selectedAreaLabel = selectedDistrict
    ? `${selectedDistrict.name}, ${selectedDistrict.subRegion}`
    : selectedSubRegion ?? (selectedRegion ? `${selectedRegion} Region` : "");

  function focusCurrentSelection() {
    if (selectedArea) {
      webViewRef.current?.injectJavaScript(`
        window.siraFocusArea && window.siraFocusArea(${selectedArea.south}, ${selectedArea.west}, ${selectedArea.north}, ${selectedArea.east});
        true;
      `);
    } else {
      webViewRef.current?.injectJavaScript(`window.siraResetMap && window.siraResetMap(); true;`);
    }
  }

  const hasFilter = Boolean(selectedRegion || selectedSubRegion || selectedDistrict || statusFilter !== "all");

  // Clears every filter; with no filter set it just re-fits the map.
  function resetAll() {
    if (hasFilter) {
      setSelectedRegion(null);
      setSelectedSubRegion(null);
      setSelectedDistrict(null);
      setStatusFilter("all");
    } else {
      webViewRef.current?.injectJavaScript(`window.siraResetMap && window.siraResetMap(); true;`);
    }
  }

  // Tapping the active status card again goes back to all incidents.
  function toggleStatus(status: Exclude<StatusFilter, "all">) {
    setStatusFilter((current) => (current === status ? "all" : status));
  }

  function openFilter(mode: Exclude<FilterMode, null>) {
    if (mode === "district" && !selectedSubRegion) {
      Alert.alert("Select SubRegion first", "Choose a SubRegion before selecting its District.");
      return;
    }
    setFilterSearch("");
    setFilterMode(mode);
  }

  function selectRegion(name: string | null) {
    setSelectedRegion(name);
    setSelectedSubRegion(null);
    setSelectedDistrict(null);
    setFilterMode(null);
    setFilterSearch("");
  }

  function selectSubRegion(item: SiraSubRegion | null) {
    if (item) setSelectedRegion(getSiraRegionName(item.name));
    setSelectedSubRegion(item?.name ?? null);
    setSelectedDistrict(null);
    setFilterMode(null);
    setFilterSearch("");
  }

  function selectDistrict(item: SiraDistrict | null) {
    setSelectedDistrict(item);
    setFilterMode(null);
    setFilterSearch("");
  }

  function handleMapMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload?.type === "SIRA_OPEN_INCIDENT" && payload.id) router.push(`/incident/${payload.id}` as any);
    } catch {
      // Ignore malformed messages.
    }
  }

  const modalTitle = filterMode === "region"
    ? "Select Region"
    : filterMode === "subregion" ? "Select SubRegion" : "Select District";
  const modalSubtitle = filterMode === "region"
    ? "The map will filter and zoom to the selected Region"
    : filterMode === "subregion"
      ? selectedRegion
        ? `SubRegions in the ${selectedRegion} Region`
        : "The map will filter and zoom to the selected SubRegion"
      : `Districts tagged under ${selectedSubRegion ?? "the selected SubRegion"}`;
  const allOption = filterMode === "region"
    ? { title: "All Regions", subtitle: "Show all Fiber Risk markers", selected: !selectedRegion, onSelect: () => selectRegion(null) }
    : filterMode === "subregion"
      ? {
          title: "All SubRegions",
          subtitle: selectedRegion ? `Show all of the ${selectedRegion} Region` : "Show all Fiber Risk markers",
          selected: !selectedSubRegion,
          onSelect: () => selectSubRegion(null),
        }
      : { title: "All Districts", subtitle: `Show all districts in ${selectedSubRegion}`, selected: !selectedDistrict, onSelect: () => selectDistrict(null) };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SiraTopBar />

      {panelOpen ? (
        <View style={styles.panel}>
          <View style={styles.filterRow}>
            <FilterButton
              icon="globe-outline"
              value={selectedRegion ?? "Region"}
              active={Boolean(selectedRegion)}
              onPress={() => openFilter("region")}
            />
            <FilterButton
              icon="layers-outline"
              value={selectedSubRegion ?? "SubRegion"}
              active={Boolean(selectedSubRegion)}
              onPress={() => openFilter("subregion")}
            />
            <FilterButton
              icon="location-outline"
              value={selectedDistrict?.name ?? "District"}
              active={Boolean(selectedDistrict)}
              disabled={!selectedSubRegion}
              onPress={() => openFilter("district")}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset filters and map view"
              style={[styles.resetButton, hasFilter && styles.resetButtonActive]}
              onPress={resetAll}
            >
              <Ionicons name="refresh" size={14} color={hasFilter ? "#ffffff" : "#1267e8"} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <Stat label="Total Incidents" value={visibleIncidents.length} color="#1267e8" tint="#eff6ff" icon="layers"
              active={statusFilter === "all"} onPress={() => setStatusFilter("all")} />
            <Stat label="Open" value={statusCounts.open} color="#dc2626" tint="#fef2f2"
              active={statusFilter === "open"} onPress={() => toggleStatus("open")} />
            <Stat label="In Progress" value={statusCounts.progress} color="#ea580c" tint="#fff7ed"
              active={statusFilter === "in_progress"} onPress={() => toggleStatus("in_progress")} />
            <Stat label="Resolved" value={statusCounts.resolved} color="#16a34a" tint="#f0fdf4"
              active={statusFilter === "resolved"} onPress={() => toggleStatus("resolved")} />
          </View>
        </View>
      ) : null}

      <View style={styles.mapWrap}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1267e8" />
            <Text allowFontScaling={false} style={styles.loadingText}>Loading Fiber Risk map...</Text>
          </View>
        ) : (
          <WebView
            key={mapRenderKey}
            ref={webViewRef}
            source={webSource}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
            onMessage={handleMapMessage}
            onLoadEnd={focusCurrentSelection}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
          />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={panelOpen ? "Hide filters and show full map" : "Show filters"}
          style={styles.panelToggle}
          onPress={() => setPanelOpen((open) => !open)}
        >
          <Ionicons name={panelOpen ? "expand-outline" : "options-outline"} size={21} color="#0f172a" />
        </Pressable>

        {!panelOpen && selectedAreaLabel ? (
          <View style={styles.areaChip}>
            <Ionicons name="funnel" size={12} color="#1267e8" />
            <Text allowFontScaling={false} numberOfLines={1} style={styles.areaChipText}>{selectedAreaLabel}</Text>
          </View>
        ) : null}

        <View style={styles.legendBar}>
          <Legend color="#dc2626" label="Open" value={statusCounts.open} />
          <View style={styles.legendDivider} />
          <Legend color="#f97316" label="In Progress" value={statusCounts.progress} />
          <View style={styles.legendDivider} />
          <Legend color="#16a34a" label="Resolved" value={statusCounts.resolved} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report a new incident"
          style={styles.fab}
          onPress={() => router.push({ pathname: "/(tabs)/report", params: { mode: "new", resetKey: Date.now().toString() } } as any)}
        >
          <Ionicons name="add" size={30} color="#ffffff" />
        </Pressable>
      </View>

      <Modal visible={Boolean(filterMode)} transparent animationType="fade" onRequestClose={() => setFilterMode(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable
          style={[styles.modalBackdrop, filterMode !== "region" && styles.modalBackdropTop]}
          onPress={() => setFilterMode(null)}
        >
          <Pressable
            style={[styles.modalCard, filterMode === "region" && styles.modalCardCompact]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text allowFontScaling={false} style={styles.modalTitle}>{modalTitle}</Text>
                <Text allowFontScaling={false} style={styles.modalSubtitle}>{modalSubtitle}</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setFilterMode(null)}>
                <Ionicons name="close" size={22} color="#334155" />
              </Pressable>
            </View>

            {filterMode !== "region" ? (
              <View style={styles.searchBox}>
                <Ionicons name="search" size={19} color="#64748b" />
                <TextInput
                  value={filterSearch}
                  onChangeText={setFilterSearch}
                  placeholder={filterMode === "subregion" ? "Search SubRegion..." : "Search District..."}
                  placeholderTextColor="#94a3b8"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
                {filterSearch ? (
                  <Pressable onPress={() => setFilterSearch("")}>
                    <Ionicons name="close-circle" size={19} color="#94a3b8" />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={{ height: 10 }} />
            )}

            <FlatList
              data={modalOptions}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 12 }}
              style={{ flexGrow: 0, flexShrink: 1 }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Pressable
                  style={[styles.areaRow, allOption.selected && styles.areaRowSelected]}
                  onPress={allOption.onSelect}
                >
                  <View style={styles.allAreasIcon}>
                    <Ionicons name="earth-outline" size={20} color="#1267e8" />
                  </View>
                  <View style={styles.areaRowText}>
                    <Text allowFontScaling={false} style={styles.areaRowTitle}>{allOption.title}</Text>
                    <Text allowFontScaling={false} style={styles.areaRowSubtitle}>{allOption.subtitle}</Text>
                  </View>
                </Pressable>
              }
              ListEmptyComponent={
                <View style={styles.emptySearch}>
                  <Ionicons name="search-outline" size={30} color="#94a3b8" />
                  <Text allowFontScaling={false} style={styles.emptySearchTitle}>No matching area found</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.areaRow, item.selected && styles.areaRowSelected]}
                  onPress={item.onSelect}
                >
                  <View style={styles.areaPinIcon}>
                    <Ionicons name={item.icon} size={19} color="#1267e8" />
                  </View>
                  <View style={styles.areaRowText}>
                    <Text allowFontScaling={false} style={styles.areaRowTitle}>{item.title}</Text>
                    <Text allowFontScaling={false} style={styles.areaRowSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons
                    name={item.selected ? "checkmark-circle" : "chevron-forward"}
                    size={item.selected ? 21 : 18}
                    color={item.selected ? "#1267e8" : "#94a3b8"}
                  />
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function FilterButton({ icon, value, active, disabled, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.filterButton, active && styles.filterButtonActive, disabled && styles.filterButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={14} color="#1267e8" />
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.filterValue, active && styles.filterValueActive]}
      >
        {value}
      </Text>
      <Ionicons name="chevron-down" size={12} color="#64748b" />
    </Pressable>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text allowFontScaling={false} numberOfLines={1} style={styles.legendText}>
        {label} ({formatCount(value)})
      </Text>
    </View>
  );
}

function Stat({ label, value, color, tint, icon, active, onPress }: {
  label: string;
  value: number;
  color: string;
  tint: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Show ${label} on map`}
      onPress={onPress}
      style={[styles.statBox, { backgroundColor: tint, borderColor: active ? color : "transparent" }]}
    >
      <View style={styles.statTop}>
        {icon ? (
          <Ionicons name={icon} size={12} color={color} />
        ) : (
          <View style={[styles.statDot, { backgroundColor: color }]} />
        )}
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, { color }]}>
          {formatCount(value)}
        </Text>
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" },
  mapWrap: { flex: 1 },
  map: { flex: 1, backgroundColor: "#e2e8f0" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#e2e8f0" },
  loadingText: { marginTop: 10, color: "#64748b", fontSize: 13, fontWeight: "800" },
  panel: {
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: "#ffffff", borderRadius: 16, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6,
    borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#0f172a",
    shadowOpacity: .08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  filterButton: {
    flex: 1, minWidth: 0, height: 36, borderRadius: 11, borderWidth: 1, borderColor: "#dbe7f5",
    backgroundColor: "#f8fbff", paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5,
  },
  filterButtonActive: { borderColor: "#1267e8", backgroundColor: "#eff6ff" },
  filterButtonDisabled: { opacity: .5 },
  filterValue: { flex: 1, minWidth: 0, color: "#334155", fontSize: 11.5, fontWeight: "800" },
  filterValueActive: { color: "#1267e8", fontWeight: "900" },
  resetButton: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "#93c5fd",
    backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center",
  },
  resetButtonActive: { backgroundColor: "#1267e8", borderColor: "#1267e8" },
  statsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  statBox: { flex: 1, minWidth: 0, borderRadius: 10, borderWidth: 1.5, paddingVertical: 4, paddingHorizontal: 4, alignItems: "center" },
  statTop: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "100%" },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statValue: { flexShrink: 1, fontSize: 18, lineHeight: 21, fontWeight: "900" },
  statLabel: { color: "#334155", fontSize: 9, fontWeight: "800" },
  panelToggle: {
    position: "absolute", top: 10, right: 10, width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center",
    shadowColor: "#0f172a", shadowOpacity: .2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  areaChip: {
    position: "absolute", top: 10, left: 10, right: 60, alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 999,
    backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: .15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  areaChipText: { flexShrink: 1, color: "#0f172a", fontSize: 11, fontWeight: "800" },
  legendBar: {
    position: "absolute", left: 10, right: 80, bottom: 22,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    height: 34, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,.96)",
    shadowColor: "#0f172a", shadowOpacity: .15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  legendDivider: { width: 1, height: 16, backgroundColor: "#e2e8f0" },
  legendItem: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { flexShrink: 1, color: "#334155", fontSize: 9.5, fontWeight: "800" },
  fab: {
    position: "absolute", right: 12, bottom: 18, width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1267e8", alignItems: "center", justifyContent: "center",
    shadowColor: "#0f172a", shadowOpacity: .22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,.55)", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 34 },
  // Searchable lists sit near the top so the keyboard never covers the last rows.
  modalBackdropTop: { justifyContent: "flex-start", paddingTop: 64, paddingBottom: 12 },
  modalCard: {
    maxHeight: "100%", flexShrink: 1, backgroundColor: "#fff", borderRadius: 22, padding: 16,
    shadowColor: "#0f172a", shadowOpacity: .25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  modalCardCompact: { paddingBottom: 8 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  modalTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  modalSubtitle: { color: "#64748b", fontSize: 11, fontWeight: "800", marginTop: 3 },
  modalClose: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  searchBox: {
    height: 48, marginTop: 15, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: "#dbe7f5",
    backgroundColor: "#f8fafc", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9,
  },
  searchInput: { flex: 1, color: "#0f172a", fontSize: 14, fontWeight: "700", paddingVertical: 0 },
  areaRow: {
    minHeight: 60, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9,
    flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "transparent",
  },
  areaRowSelected: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
  areaPinIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#eef5ff", alignItems: "center", justifyContent: "center" },
  allAreasIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#dff6ff", alignItems: "center", justifyContent: "center" },
  areaRowText: { flex: 1 },
  areaRowTitle: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  areaRowSubtitle: { color: "#64748b", fontSize: 11, fontWeight: "800", marginTop: 2 },
  emptySearch: { alignItems: "center", justifyContent: "center", paddingVertical: 46 },
  emptySearchTitle: { color: "#334155", fontSize: 14, fontWeight: "900", marginTop: 8 },
});
