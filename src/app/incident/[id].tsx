import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { formatDateTime } from "../../../lib/format";
import { incidentPhotoCacheKey, storagePathFromIncidentPhoto, useIncidentPhotoUris } from "../../../lib/incidentPhotos";
import { safeJsonForHtml } from "../../../lib/safeJson";
import { supabase } from "../../../lib/supabase";

type Incident = {
  id: string;
  incident_type: string;
  severity: string;
  title: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  address_text: string | null;
  city: string | null;
  support_required: string | null;
  photo_urls: string[] | null;
  reported_by_name: string | null;
  reported_by_job_title: string | null;
  reported_by_company: string | null;
  reported_by_phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  reporter_user_id: string | null;
};

type IncidentComment = {
  id: string;
  incident_id: string;
  user_id: string;
  username: string;
  comment_text: string;
  created_at: string;
};

const STATUS_LOOK: Record<string, { label: string; color: string; tint: string }> = {
  open: { label: "Open", color: "#dc2626", tint: "#fef2f2" },
  in_progress: { label: "In Progress", color: "#ea580c", tint: "#fff7ed" },
  resolved: { label: "Resolved", color: "#16a34a", tint: "#f0fdf4" },
};

// Share of the screen the map keeps above the fully opened details panel.
const MAP_SHARE_WHEN_OPEN = 0.3;

function statusKey(status: string) {
  if (status === "resolved") return "resolved";
  if (status === "in_progress" || status === "under_review") return "in_progress";
  return "open";
}

function severityLabel(severity: string) {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "low") return "Low";
  return "Medium";
}

function severityColor(severity: string) {
  if (severity === "low") return "#16a34a";
  if (severity === "medium") return "#f59e0b";
  return "#dc2626";
}

function publicCode(incident: Incident) {
  const digits = incident.id.replace(/\D/g, "");
  return `FR-${digits.slice(-3).padStart(3, "0")}`;
}


function buildHtml(lat: number, lng: number, color: string, label: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #e8eef7; }
    .leaflet-top.leaflet-right { margin-top: VAR_TOP; }
    .leaflet-control-zoom, .leaflet-control-layers, .sira-locate { border: 0 !important; border-radius: 12px !important; overflow: hidden; box-shadow: 0 5px 16px rgba(15,23,42,.22) !important; }
    .leaflet-control-zoom a { width: 40px !important; height: 40px !important; line-height: 40px !important; font-size: 20px !important; color: #0f172a !important; }
    .leaflet-control-layers { font-size: 12px !important; font-weight: 800 !important; color: #0f172a !important; }
    .leaflet-control-layers-toggle { width: 40px !important; height: 40px !important; background-size: 22px 22px !important; }
    .leaflet-control-layers-expanded { padding: 7px 9px !important; background: rgba(255,255,255,.97) !important; }
    .sira-locate { width: 40px; height: 40px; background: #fff; display: flex; align-items: center; justify-content: center; }
    .focus { position: relative; width: 60px; height: 60px; }
    .focus .pulse { position: absolute; inset: 0; border-radius: 50%; background: ${color}; opacity: .35; animation: pulse 1.8s ease-out infinite; }
    .focus .dot { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -14px 0 0 -14px; border-radius: 50%; background: ${color}; border: 4px solid #fff; box-shadow: 0 4px 14px rgba(15,23,42,.4); }
    @keyframes pulse { 0% { transform: scale(.3); opacity: .55; } 100% { transform: scale(1.4); opacity: 0; } }
    .tag { border: 0 !important; border-radius: 10px !important; background: #0f172a !important; color: #fff !important; font-size: 11px !important; font-weight: 800 !important; padding: 4px 8px !important; box-shadow: 0 5px 14px rgba(15,23,42,.25) !important; }
    .tag::before { border-top-color: #0f172a !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const target = [${lat}, ${lng}];
    let visibleHeight = null;
    const map = L.map("map", { zoomControl: false, attributionControl: false }).setView(target, 11);
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" });
    street.addTo(map);
    L.control.layers({ "Map": street, "Satellite": satellite }, null, { position: "topright", collapsed: true }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    const Locate = L.Control.extend({
      options: { position: "topright" },
      onAdd: function() {
        const el = L.DomUtil.create("div", "sira-locate leaflet-bar");
        el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1267e8" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="#1267e8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>';
        L.DomEvent.disableClickPropagation(el);
        el.onclick = function() { window.siraFocus(visibleHeight, 17); };
        return el;
      }
    });
    map.addControl(new Locate());

    L.marker(target, {
      icon: L.divIcon({ className: "", iconSize: [60, 60], iconAnchor: [30, 30], html: '<div class="focus"><div class="pulse"></div><div class="dot"></div></div>' })
    }).addTo(map).bindTooltip(${safeJsonForHtml(label)}, { permanent: true, direction: "top", offset: [0, -16], className: "tag" });

    // Keeps the pin in the middle of the part of the map not covered by the panel.
    window.siraFocus = function(visible, zoom) {
      if (visible) visibleHeight = visible;
      const z = zoom || Math.max(map.getZoom(), 16);
      const size = map.getSize();
      const shown = visibleHeight || size.y;
      const point = map.project(target, z).add([0, (size.y - shown) / 2]);
      map.flyTo(map.unproject(point, z), z, { duration: .7 });
    };

    setTimeout(function() { map.invalidateSize(); window.siraFocus(visibleHeight, 16); }, 250);
  </script>
</body>
</html>`;
}

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("User");
  const [updating, setUpdating] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});

  const [comments, setComments] = useState<IncidentComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // ---- Data ---------------------------------------------------------------

  const loadComments = useCallback(async (incidentId: string) => {
    const { data, error: loadError } = await supabase
      .from("sira_incident_comments")
      .select("id, incident_id, user_id, username, comment_text, created_at")
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: true });
    if (loadError) console.error("Comment load failed:", loadError.message);
    else setComments((data ?? []) as IncidentComment[]);
    setCommentsLoading(false);
  }, []);

  const loadIncident = useCallback(async () => {
    if (!id) return;
    const [{ data: { user } }, { data, error: loadError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("sira_incidents")
        .select("*")
        .eq("id", id)
        .eq("incident_type", "fiber_network_risk")
        .maybeSingle(),
    ]);

    setCurrentUserId(user?.id ?? null);
    const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name;
    setCurrentUsername(String(metadataName || (user?.email ? user.email.split("@")[0] : null) || "User"));

    if (loadError) setError(loadError.message);
    else if (!data) setError("Incident not found");
    else {
      setIncident(data as Incident);
      setError(null);
      void loadComments(String(id));
    }
    setLoading(false);
  }, [id, loadComments]);

  // Reloads when coming back from Edit so changes show straight away.
  useFocusEffect(useCallback(() => { void loadIncident(); }, [loadIncident]));

  const isOwner = Boolean(currentUserId) && Boolean(incident?.reporter_user_id) && currentUserId === incident?.reporter_user_id;

  async function updateStatus(nextStatus: string) {
    if (!incident || !currentUserId) return;
    if (!isOwner) {
      Alert.alert("Not allowed", "Only the user who uploaded this incident can update it.");
      return;
    }
    setUpdating(true);
    const { error: updateError } = await supabase
      .from("sira_incidents")
      .update({ status: nextStatus })
      .eq("id", incident.id)
      .eq("incident_type", "fiber_network_risk")
      .eq("reporter_user_id", currentUserId);
    setUpdating(false);
    if (updateError) {
      Alert.alert("Status update failed", updateError.message);
      return;
    }
    setIncident({ ...incident, status: nextStatus });
  }

  async function deleteIncident() {
    if (!incident || !currentUserId) return;
    if (!isOwner) {
      Alert.alert("Not allowed", "Only the user who uploaded this incident can delete it.");
      return;
    }
    setUpdating(true);
    try {
      const photoUrls = (incident.photo_urls ?? []).map((url) => String(url ?? "").trim()).filter(Boolean);
      const parsedPaths = photoUrls.map(storagePathFromIncidentPhoto);

      // Never delete the row while an attached image path is unknown,
      // otherwise the file would be left behind in Storage.
      if (parsedPaths.some((path) => !path)) {
        throw new Error("One or more image paths could not be identified. Incident deletion was stopped.");
      }

      const imagePaths = Array.from(new Set(parsedPaths.filter((path): path is string => Boolean(path))));
      if (imagePaths.length > 0) {
        const { error: storageError } = await supabase.storage.from("incident-photos").remove(imagePaths);
        if (storageError) throw new Error("Image cleanup failed: " + storageError.message);
      }

      const { error: deleteError, count } = await supabase
        .from("sira_incidents")
        .delete({ count: "exact" })
        .eq("id", incident.id)
        .eq("reporter_user_id", currentUserId);
      if (deleteError) throw deleteError;
      if (count === 0) throw new Error("The incident was not deleted. You may not be its uploader.");

      Alert.alert(
        "Incident deleted",
        imagePaths.length > 0 ? "The incident and its attached images have been removed." : "The incident has been removed.",
        [{ text: "OK", onPress: () => router.replace("/(tabs)/incidents" as any) }]
      );
    } catch (err) {
      Alert.alert("Delete failed", err instanceof Error ? err.message : "An unexpected deletion error occurred.");
    } finally {
      setUpdating(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete incident?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: deleteIncident },
    ]);
  }

  function chooseStatus() {
    Alert.alert("Update Status", "Choose new status", [
      { text: "Open", onPress: () => updateStatus("open") },
      { text: "In Progress", onPress: () => updateStatus("in_progress") },
      { text: "Resolved", onPress: () => updateStatus("resolved") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function postComment() {
    const trimmed = commentText.trim();
    if (!incident || !currentUserId) {
      Alert.alert("Sign in required", "You must be signed in to add a comment.");
      return;
    }
    if (!trimmed) return;
    setPostingComment(true);
    const { data, error: postError } = await supabase
      .from("sira_incident_comments")
      .insert({ incident_id: incident.id, user_id: currentUserId, username: currentUsername, comment_text: trimmed })
      .select("id, incident_id, user_id, username, comment_text, created_at")
      .single();
    setPostingComment(false);
    if (postError) {
      Alert.alert("Comment failed", postError.message);
      return;
    }
    setComments((previous) => [...previous, data as IncidentComment]);
    setCommentText("");
  }

  // ---- Draggable details panel -------------------------------------------

  const [screenHeight, setScreenHeight] = useState(0);
  const [dragZoneHeight, setDragZoneHeight] = useState(80);
  const [peekBlockHeight, setPeekBlockHeight] = useState(200);
  const peekHeight = dragZoneHeight + peekBlockHeight + 14 + insets.bottom;
  const [expanded, setExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const translateY = useRef(new Animated.Value(2000)).current;
  const dragStart = useRef(0);

  const sheetHeight = Math.max(0, screenHeight - screenHeight * MAP_SHARE_WHEN_OPEN);
  const collapsedY = Math.max(0, sheetHeight - peekHeight);
  const collapsedRef = useRef(collapsedY);
  collapsedRef.current = collapsedY;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const focusMap = useCallback((open: boolean) => {
    const visible = Math.round(open ? screenHeight - sheetHeight : screenHeight - peekHeight) + 16;
    webViewRef.current?.injectJavaScript(`window.siraFocus && window.siraFocus(${visible}); true;`);
  }, [screenHeight, sheetHeight, peekHeight]);

  const snapTo = useCallback((open: boolean) => {
    setExpanded(open);
    if (!open) {
      Keyboard.dismiss();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
    Animated.spring(translateY, {
      toValue: open ? 0 : collapsedRef.current,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
      mass: 0.8,
    }).start();
    focusMap(open);
  }, [translateY, focusMap]);

  // Keep the closed panel sitting at the right height once it has been measured.
  useEffect(() => {
    if (!screenHeight) return;
    translateY.setValue(expandedRef.current ? 0 : collapsedY);
  }, [collapsedY, screenHeight, translateY]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => {
      translateY.stopAnimation((value) => { dragStart.current = value; });
    },
    onPanResponderMove: (_, g) => {
      translateY.setValue(Math.min(collapsedRef.current, Math.max(0, dragStart.current + g.dy)));
    },
    onPanResponderRelease: (_, g) => {
      // A tap toggles; a drag snaps by speed first, then by position.
      if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) {
        snapTo(!expandedRef.current);
        return;
      }
      const position = dragStart.current + g.dy;
      const open = g.vy < -0.4 ? true : g.vy > 0.4 ? false : position < collapsedRef.current / 2;
      snapTo(open);
    },
    onPanResponderTerminate: () => snapTo(expandedRef.current),
  }), [translateY, snapTo]);

  // Android back closes the open panel before leaving the screen.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (expandedRef.current) {
        snapTo(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [snapTo]));

  // iOS does not resize the screen for the keyboard, so the comment box gets room manually.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ---- Render ---------------------------------------------------------------

  const lat = Number(incident?.latitude);
  const lng = Number(incident?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const look = STATUS_LOOK[statusKey(incident?.status ?? "")];
  const code = incident ? publicCode(incident) : "";

  const html = useMemo(
    () => (incident && hasCoords ? buildHtml(lat, lng, look.color, code).replace("VAR_TOP", `${insets.top + 6}px`) : ""),
    [incident, hasCoords, lat, lng, look.color, code, insets.top]
  );

  // Stable source object so typing a comment never reloads the map page.
  const webSource = useMemo(() => ({ html }), [html]);

  const photos = useMemo(
    () => (incident?.photo_urls ?? []).map((item) => String(item ?? "").trim()).filter(Boolean),
    [incident?.photo_urls]
  );
  // Private bucket: each stored URL is shown through a short-lived signed URL.
  const photoUris = useIncidentPhotoUris(photos);
  const previewPhotos = useMemo(
    () => photos.map((url, index) => photoUris[index] || url),
    [photos, photoUris]
  );

  if (loading || !incident) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color="#1267e8" />
              <Text allowFontScaling={false} style={styles.muted}>Loading incident...</Text>
            </>
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={36} color="#94a3b8" />
              <Text allowFontScaling={false} style={styles.muted}>{error}</Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
                <Text allowFontScaling={false} style={styles.primaryBtnText}>Go back</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const location = incident.address_text || incident.city || "GPS selected location";
  const firstPhotoIndex = photos.findIndex((url, index) => !failedPhotos[url] && Boolean(photoUris[index]));
  const firstPhoto = firstPhotoIndex >= 0 ? photoUris[firstPhotoIndex] ?? null : null;

  return (
    <View style={styles.root} onLayout={(e) => setScreenHeight(e.nativeEvent.layout.height)}>
      {hasCoords ? (
        <WebView
          ref={webViewRef}
          source={webSource}
          style={StyleSheet.absoluteFill}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          onLoadEnd={() => focusMap(expandedRef.current)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="location-outline" size={34} color="#94a3b8" />
          <Text allowFontScaling={false} style={styles.muted}>No GPS location on this incident</Text>
        </View>
      )}

      <View style={[styles.topRow, { top: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.roundBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <View style={styles.titleChip}>
          <View style={[styles.dot, { backgroundColor: look.color }]} />
          <Text allowFontScaling={false} style={styles.titleChipText}>{code}</Text>
        </View>
      </View>

      <Animated.View style={[styles.sheet, { height: sheetHeight || "70%", transform: [{ translateY }] }]}>
        <View
          {...panResponder.panHandlers}
          onLayout={(e) => setDragZoneHeight(Math.round(e.nativeEvent.layout.height))}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={expanded ? "Incident details, open. Tap to close." : "Incident details. Tap or swipe up to open."}
          onAccessibilityTap={() => snapTo(!expanded)}
        >
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <Text allowFontScaling={false} style={styles.code}>{code}</Text>
            <View style={[styles.pill, { backgroundColor: look.tint }]}>
              <Text allowFontScaling={false} style={[styles.pillText, { color: look.color }]}>{look.label}</Text>
            </View>
            <View style={styles.severity}>
              <View style={[styles.dot, { backgroundColor: severityColor(incident.severity) }]} />
              <Text allowFontScaling={false} style={styles.severityText}>{severityLabel(incident.severity)}</Text>
            </View>
            <Ionicons name={expanded ? "chevron-down" : "chevron-up"} size={20} color="#64748b" style={{ marginLeft: "auto" }} />
          </View>
          <Text allowFontScaling={false} numberOfLines={expanded ? 3 : 1} style={styles.title}>
            {incident.title || "Fiber Risk Incident"}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          scrollEnabled={expanded}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 + keyboardHeight }}
        >
          {/* Everything in this block is visible while the panel is closed. */}
          <View onLayout={(e) => setPeekBlockHeight(Math.round(e.nativeEvent.layout.height))}>
            <View style={styles.summaryRow}>
              <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                <InfoLine icon="location-outline" text={location} />
                {hasCoords ? <InfoLine icon="navigate-outline" text={`${lat.toFixed(5)}, ${lng.toFixed(5)}`} /> : null}
                <InfoLine icon="person-outline" text={`${incident.reported_by_name || "Field User"} • ${incident.reported_by_company || "Company"}`} />
                <InfoLine icon="time-outline" text={formatDateTime(incident.created_at)} />
              </View>
              {firstPhoto ? (
                <Pressable onPress={() => setPreviewIndex(firstPhotoIndex)}>
                  <Image source={{ uri: firstPhoto, cacheKey: incidentPhotoCacheKey(photos[firstPhotoIndex]) }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.actions}>
              {hasCoords ? (
                <Pressable
                  style={[styles.secondaryBtn, { flex: 1 }]}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)}
                >
                  <Ionicons name="navigate" size={16} color="#1267e8" />
                  <Text allowFontScaling={false} style={styles.secondaryBtnText}>Directions</Text>
                </Pressable>
              ) : null}
              {incident.reported_by_phone ? (
                <Pressable
                  style={[styles.secondaryBtn, { flex: 1 }]}
                  accessibilityLabel="Call reporter"
                  onPress={() => Linking.openURL(`tel:${incident.reported_by_phone}`)}
                >
                  <Ionicons name="call" size={16} color="#1267e8" />
                  <Text allowFontScaling={false} style={styles.secondaryBtnText}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Section icon="person-circle-outline" title="Reporter">
            <DetailRow label="Name" value={incident.reported_by_name || "Field User"} />
            <DetailRow label="Job title" value={incident.reported_by_job_title || "Not provided"} />
            <DetailRow label="Company" value={incident.reported_by_company || "Not provided"} />
            <DetailRow label="Mobile" value={incident.reported_by_phone || "Not added"} />
            <DetailRow label="Reported" value={formatDateTime(incident.created_at)} />
            <DetailRow label="Updated" value={formatDateTime(incident.updated_at)} last />
          </Section>

          <Section icon="document-text-outline" title="Description / Notes">
            <Text allowFontScaling={false} style={styles.body}>{incident.description || "No additional notes added."}</Text>
          </Section>

          {incident.support_required ? (
            <Section icon="construct-outline" title="Support Required">
              <Text allowFontScaling={false} style={styles.body}>{incident.support_required}</Text>
            </Section>
          ) : null}

          <Section icon="images-outline" title={`Attached Images (${photos.length})`}>
            {photos.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {photos.map((url, index) => (
                  <Pressable key={`${url}-${index}`} onPress={() => setPreviewIndex(index)}>
                    {photoUris[index] === undefined ? (
                      <View style={[styles.photo, styles.photoFallback]}>
                        <ActivityIndicator color="#64748b" />
                      </View>
                    ) : failedPhotos[url] || !photoUris[index] ? (
                      <View style={[styles.photo, styles.photoFallback]}>
                        <Ionicons name="image-outline" size={24} color="#64748b" />
                        <Text allowFontScaling={false} style={styles.photoFallbackText}>Image unavailable</Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: photoUris[index] as string, cacheKey: incidentPhotoCacheKey(url) }}
                        style={styles.photo}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        onError={() => setFailedPhotos((prev) => ({ ...prev, [url]: true }))}
                      />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text allowFontScaling={false} style={styles.mutedSmall}>No images attached.</Text>
            )}
          </Section>

          <Section icon="settings-outline" title="Manage">
            {isOwner ? (
              <>
                <View style={styles.manageRow}>
                  <Pressable style={styles.outlineBtn} disabled={updating} onPress={() => router.push(`/incident/edit/${incident.id}` as any)}>
                    <Ionicons name="pencil" size={16} color="#1267e8" />
                    <Text allowFontScaling={false} style={styles.outlineBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.outlineBtn} disabled={updating} onPress={chooseStatus}>
                    <Ionicons name="swap-horizontal-outline" size={16} color="#1267e8" />
                    <Text allowFontScaling={false} style={styles.outlineBtnText}>Status</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.resolveBtn, statusKey(incident.status) === "resolved" && { opacity: 0.5 }]}
                    disabled={updating || statusKey(incident.status) === "resolved"}
                    onPress={() => updateStatus("resolved")}
                  >
                    {updating ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="checkmark-circle-outline" size={17} color="#ffffff" />}
                    <Text allowFontScaling={false} style={styles.resolveBtnText}>Resolve</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.deleteBtn} disabled={updating} onPress={confirmDelete}>
                  <Ionicons name="trash-outline" size={17} color="#dc2626" />
                  <Text allowFontScaling={false} style={styles.deleteBtnText}>Delete Incident</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.notice}>
                <Ionicons name="lock-closed-outline" size={16} color="#64748b" />
                <Text allowFontScaling={false} style={styles.noticeText}>Only the uploader can edit, update or delete this incident.</Text>
              </View>
            )}
          </Section>

          <Section icon="chatbubbles-outline" title={`Comments (${comments.length})`}>
            {commentsLoading ? (
              <ActivityIndicator size="small" color="#1267e8" style={{ marginVertical: 10 }} />
            ) : comments.length === 0 ? (
              <Text allowFontScaling={false} style={styles.mutedSmall}>No comments yet. Be the first to add an update.</Text>
            ) : (
              <View style={{ gap: 12 }}>
                {comments.map((comment) => (
                  <View key={comment.id} style={styles.comment}>
                    <View style={styles.avatar}>
                      <Text allowFontScaling={false} style={styles.avatarText}>{comment.username.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.commentHead}>
                        <Text allowFontScaling={false} numberOfLines={1} style={styles.commentUser}>{comment.username}</Text>
                        <Text allowFontScaling={false} style={styles.commentTime}>{formatDateTime(comment.created_at)}</Text>
                      </View>
                      <Text allowFontScaling={false} style={styles.commentText}>{comment.comment_text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.composer}>
              <TextInput
                style={styles.commentInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor="#94a3b8"
                multiline
                maxLength={1000}
                editable={!postingComment}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
              <Pressable
                accessibilityLabel="Post comment"
                style={[styles.sendBtn, (!commentText.trim() || postingComment) && { opacity: 0.45 }]}
                disabled={!commentText.trim() || postingComment}
                onPress={postComment}
              >
                {postingComment ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={16} color="#ffffff" />}
              </Pressable>
            </View>
          </Section>
        </ScrollView>
      </Animated.View>

      <ImageGallery
        photos={previewPhotos}
        startIndex={previewIndex}
        failed={failedPhotos}
        onFail={(url) => setFailedPhotos((prev) => ({ ...prev, [url]: true }))}
        onClose={() => setPreviewIndex(null)}
      />
    </View>
  );
}

// Full-screen photo viewer: swipe sideways between photos, close from the top bar.
function ImageGallery({ photos, startIndex, failed, onFail, onClose }: {
  photos: string[];
  startIndex: number | null;
  failed: Record<string, boolean>;
  onFail: (url: string) => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (startIndex !== null) setIndex(startIndex);
  }, [startIndex]);

  function goTo(next: number) {
    const target = Math.min(photos.length - 1, Math.max(0, next));
    listRef.current?.scrollToIndex({ index: target, animated: true });
    setIndex(target);
  }

  return (
    <Modal visible={startIndex !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.previewBackdrop}>
        {startIndex !== null ? (
          <FlatList
            ref={listRef}
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={startIndex}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(url, i) => url + "-" + i}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={{ width, flex: 1, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 56 }}>
                {failed[item] ? (
                  <View style={[styles.center, { backgroundColor: "transparent" }]}>
                    <Ionicons name="image-outline" size={48} color="#94a3b8" />
                    <Text allowFontScaling={false} style={[styles.muted, { color: "#cbd5e1" }]}>Image cannot be displayed</Text>
                  </View>
                ) : (
                  <Image source={{ uri: item }} style={{ flex: 1 }} contentFit="contain" onError={() => onFail(item)} />
                )}
              </View>
            )}
          />
        ) : null}

        <View style={[styles.previewHeader, { paddingTop: insets.top + 10 }]}>
          <Text allowFontScaling={false} style={styles.previewCount}>
            {photos.length > 1 ? (index + 1) + " / " + photos.length : "Photo"}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" hitSlop={12} style={styles.previewClose} onPress={onClose}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
        </View>

        {photos.length > 1 ? (
          <View style={[styles.previewDots, { bottom: insets.bottom + 22 }]}>
            {photos.map((url, i) => (
              <Pressable key={url + "-dot-" + i} hitSlop={6} onPress={() => goTo(i)}>
                <View style={[styles.previewDot, i === index && styles.previewDotActive]} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function InfoLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={13} color="#64748b" />
      <Text allowFontScaling={false} numberOfLines={1} style={styles.infoText}>{text}</Text>
    </View>
  );
}

function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={17} color="#1267e8" />
        <Text allowFontScaling={false} style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <Text allowFontScaling={false} style={styles.detailLabel}>{label}</Text>
      <Text allowFontScaling={false} numberOfLines={2} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const shadow = {
  shadowColor: "#0f172a", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e2e8f0" },
  safe: { flex: 1, backgroundColor: "#ffffff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24, backgroundColor: "#f5f7fb" },
  muted: { color: "#64748b", fontSize: 13, fontWeight: "800", textAlign: "center" },
  mutedSmall: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  topRow: { position: "absolute", left: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  roundBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", ...shadow },
  titleChip: { height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", gap: 6, ...shadow },
  titleChipText: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "#ffffff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16,
    shadowColor: "#0f172a", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  handleArea: { alignItems: "center", paddingTop: 8, paddingBottom: 8 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  code: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  pill: { borderRadius: 999, paddingHorizontal: 9, height: 23, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 10.5, fontWeight: "900" },
  severity: { flexDirection: "row", alignItems: "center", gap: 4 },
  severityText: { color: "#334155", fontSize: 11, fontWeight: "800" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { color: "#0f172a", fontSize: 14.5, fontWeight: "900", marginTop: 6, marginBottom: 10, lineHeight: 19 },
  summaryRow: { flexDirection: "row", gap: 12 },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { flex: 1, color: "#475569", fontSize: 11.5, fontWeight: "700" },
  thumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: "#e2e8f0" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  primaryBtn: { height: 44, paddingHorizontal: 16, borderRadius: 13, backgroundColor: "#1267e8", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  primaryBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  secondaryBtn: { height: 44, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#eff6ff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secondaryBtnText: { color: "#1267e8", fontSize: 13, fontWeight: "900" },
  section: { marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e2e8f0" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
  sectionTitle: { color: "#0f172a", fontSize: 14.5, fontWeight: "900" },
  body: { color: "#334155", fontSize: 13, fontWeight: "600", lineHeight: 19 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef2f7" },
  detailLabel: { width: 82, color: "#64748b", fontSize: 12, fontWeight: "700" },
  detailValue: { flex: 1, color: "#0f172a", fontSize: 12.5, fontWeight: "800", textAlign: "right" },
  photo: { width: 132, height: 132, borderRadius: 14, backgroundColor: "#e2e8f0" },
  photoFallback: { alignItems: "center", justifyContent: "center", gap: 4, padding: 8 },
  photoFallbackText: { color: "#64748b", fontSize: 10.5, fontWeight: "800", textAlign: "center" },
  manageRow: { flexDirection: "row", gap: 8 },
  outlineBtn: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  outlineBtnText: { color: "#1267e8", fontSize: 12.5, fontWeight: "900" },
  resolveBtn: { flex: 1.2, height: 42, borderRadius: 12, backgroundColor: "#16a34a", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  resolveBtnText: { color: "#ffffff", fontSize: 12.5, fontWeight: "900" },
  deleteBtn: { height: 42, marginTop: 8, borderRadius: 12, backgroundColor: "#fef2f2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  deleteBtnText: { color: "#dc2626", fontSize: 12.5, fontWeight: "900" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 12, backgroundColor: "#f8fafc" },
  noticeText: { flex: 1, color: "#64748b", fontSize: 11.5, fontWeight: "700" },
  comment: { flexDirection: "row", gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#1267e8", fontSize: 12, fontWeight: "900" },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentUser: { flexShrink: 1, color: "#0f172a", fontSize: 12.5, fontWeight: "900" },
  commentTime: { color: "#94a3b8", fontSize: 10.5, fontWeight: "700" },
  commentText: { color: "#334155", fontSize: 12.5, fontWeight: "600", lineHeight: 18, marginTop: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 14 },
  commentInput: {
    flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 14, borderWidth: 1, borderColor: "#dbe7f5", backgroundColor: "#f8fafc",
    paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, color: "#0f172a", fontSize: 13, fontWeight: "600",
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#1267e8", alignItems: "center", justifyContent: "center" },
  previewBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,.96)" },
  previewHeader: {
    position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  previewCount: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  previewDots: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 },
  previewDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,.35)" },
  previewDotActive: { width: 20, backgroundColor: "#ffffff" },
  previewClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", justifyContent: "center" },
});
