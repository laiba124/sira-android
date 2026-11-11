import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { safeJsonForHtml } from "../lib/safeJson";
import type { LatLng } from "../types/incident";

type Props = {
  coordinate: LatLng;
  height?: number;
  zoom?: number;
  interactive?: boolean;
  fill?: boolean;
  markerLabel?: string;
};

function buildHtml(
  coordinate: LatLng,
  zoom: number,
  interactive: boolean,
  markerLabel: string
) {
  const lat = Number(coordinate.latitude.toFixed(7));
  const lng = Number(coordinate.longitude.toFixed(7));

  return `<!DOCTYPE html>
<html>
<head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      background: #edf3fb;
    }

    .leaflet-control-attribution {
      font-size: 9px !important;
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

    .incident-location-pin {
      width: 24px;
      height: 24px;
      border-radius: 12px;
      background: #f97316;
      border: 4px solid #ffffff;
      box-shadow: 0 5px 16px rgba(15, 23, 42, 0.35);
    }

    .location-label {
      border: 0 !important;
      border-radius: 10px !important;
      background: #0f172a !important;
      color: #ffffff !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      box-shadow: 0 5px 14px rgba(15, 23, 42, 0.22) !important;
    }

    .location-label::before {
      border-top-color: #0f172a !important;
    }
  </style>
</head>

<body>
  <div id="map"></div>

  <script>
    const interactive = ${interactive ? "true" : "false"};

    const map = L.map("map", {
      zoomControl: interactive,
      attributionControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      tap: interactive,
    }).setView([${lat}, ${lng}], ${zoom});

    const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    });

    const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles © Esri",
    });

    streetLayer.addTo(map);

    if (interactive) {
      L.control.layers(
        { "Map": streetLayer, "Satellite": satelliteLayer },
        null,
        { position: "bottomright", collapsed: false }
      ).addTo(map);
    }

    const icon = L.divIcon({
      className: "",
      html: '<div class="incident-location-pin"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([${lat}, ${lng}], { icon }).addTo(map);

    ${
      interactive
        ? `marker
            .bindTooltip(${safeJsonForHtml(markerLabel)}, {
              permanent: true,
              direction: "top",
              offset: [0, -13],
              className: "location-label",
            })
            .openTooltip();`
        : ""
    }

    setTimeout(function() {
      map.invalidateSize();
    }, 300);
  </script>
</body>
</html>`;
}

export default function LeafletMiniMap({
  coordinate,
  height = 170,
  zoom = 15,
  interactive = false,
  fill = false,
  markerLabel = "Incident location",
}: Props) {
  const html = useMemo(
    () => buildHtml(coordinate, zoom, interactive, markerLabel),
    [
      coordinate.latitude,
      coordinate.longitude,
      interactive,
      markerLabel,
      zoom,
    ]
  );

  return (
    <View style={[styles.container, fill ? styles.fill : { height }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={interactive}
        bounces={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d8e2ef",
    backgroundColor: "#edf3fb",
  },
  fill: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
  },
  webView: {
    flex: 1,
    backgroundColor: "#edf3fb",
  },
});
