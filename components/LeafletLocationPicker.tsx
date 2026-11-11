import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { safeJsonForHtml } from "../lib/safeJson";

type LatLngLike = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
} | null;

type LocationPayload = {
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  label?: string;
};

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
};

type LeafletLocationPickerProps = {
  coordinate?: LatLngLike;
  value?: LatLngLike;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  onChange?: ((payload: LocationPayload) => void) | ((lat: number, lng: number) => void);
  onLocationChange?: ((payload: LocationPayload) => void) | ((lat: number, lng: number) => void);
  onCoordinateChange?: ((payload: LocationPayload) => void) | ((lat: number, lng: number) => void);
};

const DEFAULT_LAT = 33.6844;
const DEFAULT_LNG = 73.0479;

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function deriveLatLng(props: LeafletLocationPickerProps) {
  const latitude =
    props.coordinate?.latitude ??
    props.coordinate?.lat ??
    props.value?.latitude ??
    props.value?.lat ??
    props.latitude ??
    props.lat ??
    DEFAULT_LAT;

  const longitude =
    props.coordinate?.longitude ??
    props.coordinate?.lng ??
    props.value?.longitude ??
    props.value?.lng ??
    props.longitude ??
    props.lng ??
    DEFAULT_LNG;

  return {
    latitude: asNumber(latitude, DEFAULT_LAT),
    longitude: asNumber(longitude, DEFAULT_LNG),
  };
}

function callMaybe(
  callback:
    | (((payload: LocationPayload) => void) | ((lat: number, lng: number) => void))
    | undefined,
  payload: LocationPayload
) {
  if (!callback) return;

  const fn = callback as any;

  if (fn.length >= 2) {
    fn(payload.latitude, payload.longitude);
  } else {
    fn(payload);
  }
}

function htmlForMap(latitude: number, longitude: number, interactive: boolean) {
  const safeLat = Number.isFinite(latitude) ? latitude : DEFAULT_LAT;
  const safeLng = Number.isFinite(longitude) ? longitude : DEFAULT_LNG;
  const interactiveFlag = interactive ? "true" : "false";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      padding: 0;
      margin: 0;
      overflow: hidden;
      background: #e8eef7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }

    #map {
      position: absolute;
      inset: 0;
      touch-action: none;
    }

    .leaflet-control-attribution {
      font-size: 9px !important;
    }

    .leaflet-control-zoom {
      display: ${interactive ? "block" : "none"};
    }

    .leaflet-control-layers {
      border: 0 !important;
      border-radius: 12px !important;
      box-shadow: 0 5px 16px rgba(15, 23, 42, 0.22) !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
    }

    .leaflet-control-layers-expanded {
      padding: 7px 9px !important;
      background: rgba(255,255,255,.97) !important;
    }

    .leaflet-bottom.leaflet-right {
      bottom: 74px;
    }
  </style>
</head>

<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  <script>
    const INITIAL_LAT = ${safeLat};
    const INITIAL_LNG = ${safeLng};
    const INTERACTIVE = ${interactiveFlag};

    const map = L.map("map", {
      zoomControl: INTERACTIVE,
      attributionControl: true,
      dragging: INTERACTIVE,
      tap: INTERACTIVE,
      touchZoom: INTERACTIVE,
      scrollWheelZoom: false,
      doubleClickZoom: INTERACTIVE,
      boxZoom: INTERACTIVE,
      keyboard: INTERACTIVE
    }).setView([INITIAL_LAT, INITIAL_LNG], 17);

    const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    });

    const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles © Esri"
    });

    streetLayer.addTo(map);

    if (INTERACTIVE) {
      L.control.layers(
        {
          "Map": streetLayer,
          "Satellite": satelliteLayer
        },
        null,
        { position: "bottomright", collapsed: false }
      ).addTo(map);
    }

    const marker = L.marker([INITIAL_LAT, INITIAL_LNG], {
      draggable: INTERACTIVE
    }).addTo(map);

    function postLocation(lat, lng, label) {
      if (!window.ReactNativeWebView) return;

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "locationChange",
        latitude: Number(lat),
        longitude: Number(lng),
        lat: Number(lat),
        lng: Number(lng),
        label: label || ""
      }));
    }

    function setLocation(lat, lng, zoom, label) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], zoom || 17);
      postLocation(lat, lng, label || "");
    }

    window.setLocationFromRN = function(lat, lng, label) {
      setLocation(Number(lat), Number(lng), 17, label || "");
    };

    let lastDragPost = 0;

    marker.on("drag", function () {
      const now = Date.now();
      if (now - lastDragPost < 100) return;
      lastDragPost = now;

      const pos = marker.getLatLng();
      postLocation(pos.lat, pos.lng, "");
    });

    marker.on("dragend", function () {
      const pos = marker.getLatLng();
      postLocation(pos.lat, pos.lng, "");
    });

    map.on("click", function (event) {
      if (!INTERACTIVE) return;
      setLocation(event.latlng.lat, event.latlng.lng, 17, "");
    });

    if (!INTERACTIVE) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();

      if (map.tap) {
        map.tap.disable();
      }
    }

    setTimeout(function () {
      map.invalidateSize();
    }, 300);
  </script>
</body>
</html>
`;
}

export default function LeafletLocationPicker(props: LeafletLocationPickerProps) {
  const mapRef = useRef<WebView>(null);
  const incoming = deriveLatLng(props);

  const [selected, setSelected] = useState({
    latitude: incoming.latitude,
    longitude: incoming.longitude,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const next = deriveLatLng(props);

    const latChanged = Math.abs(next.latitude - selected.latitude) > 0.000001;
    const lngChanged = Math.abs(next.longitude - selected.longitude) > 0.000001;

    if (latChanged || lngChanged) {
      setSelected(next);
    }
  }, [
    props.latitude,
    props.longitude,
    props.lat,
    props.lng,
    props.coordinate?.latitude,
    props.coordinate?.longitude,
    props.coordinate?.lat,
    props.coordinate?.lng,
    props.value?.latitude,
    props.value?.longitude,
    props.value?.lat,
    props.value?.lng,
  ]);

  const previewHtml = useMemo(() => {
    return htmlForMap(selected.latitude, selected.longitude, false);
  }, [selected.latitude, selected.longitude]);

  const pickerHtml = useMemo(() => {
    return htmlForMap(selected.latitude, selected.longitude, true);
  }, [modalVisible]);

  function emit(next: LocationPayload) {
    const clean: LocationPayload = {
      latitude: asNumber(next.latitude ?? next.lat, DEFAULT_LAT),
      longitude: asNumber(next.longitude ?? next.lng, DEFAULT_LNG),
      lat: asNumber(next.latitude ?? next.lat, DEFAULT_LAT),
      lng: asNumber(next.longitude ?? next.lng, DEFAULT_LNG),
      label: next.label,
    };

    setSelected({
      latitude: clean.latitude,
      longitude: clean.longitude,
    });

    callMaybe(props.onChange, clean);
    callMaybe(props.onLocationChange, clean);
    callMaybe(props.onCoordinateChange, clean);
  }

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data);

      if (payload?.type === "locationChange") {
        emit(payload);
      }
    } catch {
      // Ignore malformed WebView messages
    }
  }

  async function searchPlaces(autoApplyFirst = false) {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 3) {
      Alert.alert("Search location", "Type at least 3 characters, for example G-11 Islamabad.");
      return;
    }

    setSearching(true);

    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=8&countrycodes=pk&addressdetails=1&q=" +
        encodeURIComponent(cleanQuery);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en",
          
        },
      });

      const json = (await response.json()) as SearchResult[];

      setResults(json);

      if (autoApplyFirst && json.length > 0) {
        applySearchResult(json[0]);
      }

      if (json.length === 0) {
        Alert.alert("No result found", "Try a more specific location, for example G-11 Markaz Islamabad.");
      }
    } catch {
      Alert.alert("Search failed", "Could not search location. Check internet and try again.");
    } finally {
      setSearching(false);
    }
  }

  function applySearchResult(item: SearchResult) {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const label = item.display_name || query.trim();

    emit({
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      label,
    });

    setQuery(label.split(",").slice(0, 2).join(", "));
    setResults([]);

    const js = `
      if (window.setLocationFromRN) {
        window.setLocationFromRN(${latitude}, ${longitude}, ${safeJsonForHtml(label)});
      }
      true;
    `;

    mapRef.current?.injectJavaScript(js);
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text allowFontScaling={false} style={styles.title}>
            Incident Location
          </Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            Default is phone GPS. Search or adjust only if needed.
          </Text>
        </View>
      </View>

      <Pressable style={styles.previewShell} onPress={() => setModalVisible(true)}>
        <WebView
          key={`preview-${selected.latitude}-${selected.longitude}`}
          source={{ html: previewHtml }}
          style={styles.previewMap}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          pointerEvents="none"
          originWhitelist={["*"]}
        />

        <View style={styles.previewOverlay}>
          <Ionicons name="search" size={20} color="#ffffff" />
          <Text allowFontScaling={false} style={styles.previewOverlayText}>
            Open location picker
          </Text>
        </View>
      </Pressable>

      <Pressable style={styles.openButton} onPress={() => setModalVisible(true)}>
        <Ionicons name="map-outline" size={20} color="#1267e8" />
        <Text allowFontScaling={false} style={styles.openButtonText}>
          Search / adjust location
        </Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalIconBtn} onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={25} color="#0f172a" />
            </Pressable>

            <View style={styles.modalTitleWrap}>
              <Text allowFontScaling={false} style={styles.modalTitle}>
                Select Incident Location
              </Text>
              <Text allowFontScaling={false} style={styles.modalSub}>
                Search, tap map, drag the pin, or switch Map / Satellite
              </Text>
            </View>

            <Pressable style={styles.doneButton} onPress={() => setModalVisible(false)}>
              <Text allowFontScaling={false} style={styles.doneText}>
                Done
              </Text>
            </Pressable>
          </View>

          <View style={styles.mapArea}>
            <WebView
              ref={mapRef}
              key={`picker-${modalVisible}`}
              source={{ html: pickerHtml }}
              style={styles.fullMap}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={["*"]}
              onMessage={handleMessage}
              scrollEnabled={false}
              nestedScrollEnabled
              androidLayerType="hardware"
            />

            <View style={styles.searchPanel}>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={22} color="#1267e8" />

                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search area, city, road, landmark..."
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => searchPlaces(true)}
                />

                <Pressable style={styles.goButton} onPress={() => searchPlaces(true)}>
                  {searching ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text allowFontScaling={false} style={styles.goText}>
                      Go
                    </Text>
                  )}
                </Pressable>
              </View>

              {results.length > 0 && (
                <ScrollView style={styles.resultsBox} keyboardShouldPersistTaps="handled">
                  {results.map((item, index) => (
                    <Pressable
                      key={`${item.lat}-${item.lon}-${index}`}
                      style={styles.resultItem}
                      onPress={() => applySearchResult(item)}
                    >
                      <Ionicons name="location-outline" size={17} color="#1267e8" />
                      <Text allowFontScaling={false} numberOfLines={2} style={styles.resultText}>
                        {item.display_name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.mapHint}>
              <Text allowFontScaling={false} style={styles.mapHintText}>
                Search a place, tap the map, drag the pin, or switch Map / Satellite.
              </Text>
            </View>
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.bottomCoordsBox}>
              <Ionicons name="location" size={18} color="#1267e8" />
              <Text allowFontScaling={false} style={styles.bottomCoordsText}>
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
              </Text>
            </View>

            <Text allowFontScaling={false} style={styles.bottomHint}>
              Changes are applied immediately. Press Done to return to the form.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 11.5,
    fontWeight: "800",
    marginTop: 3,
  },
  previewShell: {
    height: 210,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#e2e8f0",
  },
  previewMap: {
    flex: 1,
    backgroundColor: "#e2e8f0",
  },
  previewOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(15,23,42,.84)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  previewOverlayText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  openButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  openButtonText: {
    color: "#1267e8",
    fontSize: 14,
    fontWeight: "900",
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  modalHeader: {
    height: 76,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  modalSub: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  doneButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: "#1267e8",
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  mapArea: {
    flex: 1,
    backgroundColor: "#e2e8f0",
  },
  fullMap: {
    flex: 1,
    backgroundColor: "#e2e8f0",
  },
  searchPanel: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    zIndex: 20,
  },
  searchRow: {
    height: 54,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.98)",
    borderWidth: 1,
    borderColor: "#dbe7f5",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  goButton: {
    height: 40,
    minWidth: 54,
    borderRadius: 14,
    backgroundColor: "#1267e8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  goText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  resultsBox: {
    marginTop: 8,
    maxHeight: 230,
    backgroundColor: "rgba(255,255,255,.99)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    overflow: "hidden",
  },
  resultItem: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  resultText: {
    flex: 1,
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "800",
    lineHeight: 17,
  },
  mapHint: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 18,
    borderRadius: 17,
    backgroundColor: "rgba(15,23,42,.86)",
    padding: 13,
  },
  mapHintText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  bottomBar: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  bottomCoordsBox: {
    height: 42,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  bottomCoordsText: {
    color: "#1267e8",
    fontSize: 14,
    fontWeight: "900",
  },
  bottomHint: {
    color: "#64748b",
    fontSize: 11.5,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
  },
});

