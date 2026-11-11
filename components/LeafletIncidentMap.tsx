import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import type { SiraIncident } from "../types/incident";
import { getIncidentTypeMeta, getPublicIncidentCode, getShortStatusLabel } from "../types/incident";
import { safeJsonForHtml } from "../lib/safeJson";

type Props = {
  incidents: SiraIncident[];
  onIncidentPress?: (id: string) => void;
};

function operationalStatus(status: string) {
  if (status === "resolved") return "resolved";
  if (status === "in_progress" || status === "under_review") return "in_progress";
  return "open";
}

function markerColor(status: string) {
  const normalized = operationalStatus(status);
  if (normalized === "resolved") return "#16a34a";
  if (normalized === "in_progress") return "#f97316";
  return "#dc2626";
}

function buildHtml(incidents: SiraIncident[]) {
  const valid = incidents.filter(
    (item) =>
      item.incident_type === "fiber_network_risk" &&
      Number.isFinite(Number(item.latitude)) &&
      Number.isFinite(Number(item.longitude))
  );
  const center = valid[0] ?? { latitude: 33.6844, longitude: 73.0479 };
  const markers = valid.map((item) => ({
    id: item.id,
    lat: Number(Number(item.latitude).toFixed(7)),
    lng: Number(Number(item.longitude).toFixed(7)),
    title: String(item.title ?? "Fiber Risk Incident").replace(/`/g, ""),
    code: getPublicIncidentCode(item),
    category: getIncidentTypeMeta(item.incident_type).shortLabel,
    status: getShortStatusLabel(item.status),
    color: markerColor(item.status),
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #eaf1fb; }
    .pin { width: 18px; height: 18px; border-radius: 999px; border: 3px solid white; box-shadow: 0 6px 18px rgba(0,0,0,.24); }
    .popupTitle { font-weight: 800; font-size: 13px; color: #0f172a; }
    .popupMeta { margin-top: 3px; color: #475569; font-size: 12px; }
    .popupButton { margin-top: 8px; color: #0b64e6; font-weight: 800; }
    .leaflet-control-layers { border: 0 !important; border-radius: 12px !important; box-shadow: 0 5px 16px rgba(15,23,42,.22) !important; font-size: 12px !important; font-weight: 800 !important; color: #0f172a !important; }
    .leaflet-control-layers-expanded { padding: 7px 9px !important; background: rgba(255,255,255,.97) !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const markers = ${safeJsonForHtml(markers)};
    function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
    const map = L.map('map', { zoomControl: true, attributionControl: false, preferCanvas: true }).setView([${center.latitude}, ${center.longitude}], 12);
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    streetLayer.addTo(map);
    L.control.layers({ 'Map': streetLayer, 'Satellite': satelliteLayer }, null, { position: 'bottomleft', collapsed: false }).addTo(map);

    const bounds = [];
    markers.forEach(function(item) {
      const icon = L.divIcon({
        className: '',
        html: '<div class="pin" style="background:' + item.color + '"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker([item.lat, item.lng], { icon }).addTo(map);
      marker.bindPopup('<div class="popupTitle">' + esc(item.code) + '</div><div class="popupMeta">' + esc(item.category) + ' • ' + esc(item.status) + '</div><div class="popupMeta">' + esc(item.title) + '</div><div class="popupButton">Tap marker to open</div>');
      marker.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SIRA_OPEN_INCIDENT', id: item.id }));
      });
      bounds.push([item.lat, item.lng]);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [34, 34] });
    setTimeout(function() { map.invalidateSize(); }, 350);
  </script>
</body>
</html>`;
}

export default function LeafletIncidentMap({ incidents, onIncidentPress }: Props) {
  const html = useMemo(() => buildHtml(incidents), [incidents]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload?.type === "SIRA_OPEN_INCIDENT" && payload.id) {
        onIncidentPress?.(payload.id);
      }
    } catch {
      // Ignore malformed WebView messages.
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#eaf1fb",
  },
  webView: {
    flex: 1,
    backgroundColor: "#eaf1fb",
  },
});
