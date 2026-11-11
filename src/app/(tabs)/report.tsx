import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import IncidentRefreshButton from "../../../components/IncidentRefreshButton";
import LeafletLocationPicker from "../../../components/LeafletLocationPicker";
import SiraTopBar from "../../../components/SiraTopBar";
import { inferSiraArea } from "../../../lib/siraAreas";
import { supabase } from "../../../lib/supabase";
import { uploadIncidentPhotos } from "../../../lib/uploadIncidentPhotos";
import { useAuth } from "../../context/AuthContext";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const DEFAULT_LAT = 33.6844;
const DEFAULT_LNG = 73.0479;
const GPS_TIMEOUT_MS = 15000;

// Where the pin came from: still the placeholder, a GPS fix, or placed by hand.
type LocationSource = "default" | "gps" | "manual";

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GPS timed out")), ms)),
  ]);
}

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; resetKey?: string }>();
  const { user, profile } = useAuth();
  const lastResetKeyRef = useRef<string | null>(null);

  const [latitude, setLatitude] = useState(DEFAULT_LAT);
  const [longitude, setLongitude] = useState(DEFAULT_LNG);
  const [locationPickerKey, setLocationPickerKey] = useState(() => Date.now().toString());

  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("high");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addressText, setAddressText] = useState("");
  const [supportRequired, setSupportRequired] = useState("");

  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingGps, setRefreshingGps] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>("default");
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  function wipeFormOnly() {
    setSeverity("high");
    setTitle("");
    setDescription("");
    setAddressText("");
    setSupportRequired("");
    setPhotos([]);
  }

  async function forceRefreshNewIncident(showSuccessAlert = true) {
    try {
      setRefreshingGps(true);

      // Clear every old value first so stale form state cannot survive.
      wipeFormOnly();
      setLatitude(DEFAULT_LAT);
      setLongitude(DEFAULT_LNG);
      setLocationSource("default");
      setGpsAccuracy(null);
      setLocationPickerKey(Date.now().toString());

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Allow location access to capture the incident GPS, or drag the pin on the map to the incident location."
        );
        return;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert(
          "Location is turned off",
          "Turn on Location (GPS) in your phone settings and tap Refresh, or drag the pin on the map to the incident location."
        );
        return;
      }

      // A fresh fix can take long under cover; fall back to a recent known position.
      let position: Location.LocationObject | null = null;
      try {
        position = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          GPS_TIMEOUT_MS
        );
      } catch {
        position = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
      }

      if (!position) {
        Alert.alert(
          "GPS signal not found",
          "Move to an open area and tap Refresh, or drag the pin on the map to the incident location."
        );
        return;
      }

      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
      setLocationSource("gps");
      setGpsAccuracy(position.coords.accuracy ?? null);
      setLocationPickerKey(Date.now().toString());

      if (showSuccessAlert) {
        Alert.alert("Refreshed", "Form cleared and current GPS fetched.");
      }
    } catch (error: any) {
      console.log("Force refresh GPS failed:", error);
      if (showSuccessAlert) {
        Alert.alert("GPS Error", error?.message ?? "Unable to fetch current GPS location.");
      }
    } finally {
      setRefreshingGps(false);
    }
  }

  useEffect(() => {
    const currentResetKey = String(params.resetKey ?? "initial-open");

    if (lastResetKeyRef.current === currentResetKey) {
      return;
    }

    lastResetKeyRef.current = currentResetKey;
    forceRefreshNewIncident(false);
  }, [params.resetKey]);

  const MAX_PHOTOS = 2;
  const photosRemaining = MAX_PHOTOS - photos.length;

  function addPhotos(assets: ImagePicker.ImagePickerAsset[]) {
    setPhotos((current) => [...current, ...assets].slice(0, MAX_PHOTOS));
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  async function pickImages() {
    if (photosRemaining <= 0) {
      Alert.alert("Image limit", `You can attach up to ${MAX_PHOTOS} images. Remove one to add another.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      quality: 0.75,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      selectionLimit: photosRemaining,
    });

    if (!result.canceled) {
      addPhotos(result.assets);
    }
  }

  async function takePhoto() {
    if (photosRemaining <= 0) {
      Alert.alert("Image limit", `You can attach up to ${MAX_PHOTOS} images. Remove one to add another.`);
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Camera Permission Required",
        permission.canAskAgain
          ? "Please allow camera access to take incident photos."
          : "Camera access is turned off for SIRA. Enable it in your phone Settings to take incident photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.75,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled) {
      addPhotos(result.assets);
    }
  }

  const inferredArea = useMemo(
    () => inferSiraArea({ latitude, longitude, address_text: addressText }),
    [latitude, longitude, addressText]
  );

  // Clears the form and re-captures GPS, ready for the next report.
  function resetAfterSave() {
    void forceRefreshNewIncident(false);
  }

  async function submitIncident() {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please add a short incident title.");
      return;
    }

    if (!user) {
      Alert.alert("Sign in required", "Please login before reporting an incident.");
      return;
    }

    if (!profile) {
      Alert.alert("Profile missing", "Please logout and login again so your profile can be loaded.");
      return;
    }

    if (locationSource === "default") {
      Alert.alert(
        "Location not captured",
        "GPS has not been captured yet. Tap Refresh to get your GPS, or drag the pin on the map to the incident location."
      );
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase
      .from("sira_incidents")
      .insert({
        incident_type: "fiber_network_risk",
        severity,
        title: title.trim(),
        description: description.trim() || null,
        latitude,
        longitude,
        address_text: addressText.trim() || "GPS selected location",
        city: inferredArea?.name ?? null,
        support_required: supportRequired.trim() || null,
        reported_by_name: profile.full_name,
        reported_by_job_title: profile.job_title || profile.role || null,
        reported_by_company: profile.company,
        reported_by_phone: profile.mobile_number,
        reporter_user_id: user.id,
        status: "open",
        photo_urls: [],
      })
      .select("*")
      .single();

    if (error) {
      setSubmitting(false);
      Alert.alert("Submit failed", error.message);
      return;
    }

    try {
      if (photos.length > 0) {
        const urls = await uploadIncidentPhotos(data.id, photos);

        const { error: updateError } = await supabase
          .from("sira_incidents")
          .update({ photo_urls: urls })
          .eq("id", data.id)
          .eq("incident_type", "fiber_network_risk")
          .eq("reporter_user_id", user.id);

        if (updateError) throw updateError;
      }

      setSubmitting(false);
      resetAfterSave();
      Alert.alert("Incident submitted", "Your incident has been saved successfully.", [
        { text: "Report another", style: "cancel" },
        { text: "View Incidents", onPress: () => router.replace("/(tabs)/incidents" as any) },
      ]);
    } catch (uploadError: any) {
      // The incident row already exists; clear the form so it is not submitted twice.
      setSubmitting(false);
      resetAfterSave();
      Alert.alert(
        "Saved without photos",
        "The incident was saved, but the photos could not upload" +
          (uploadError?.message ? " (" + uploadError.message + ")" : "") +
          ". You can open it from Incidents later.",
        [{ text: "View Incidents", onPress: () => router.replace("/(tabs)/incidents" as any) }]
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SiraTopBar />

      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text allowFontScaling={false} style={styles.heading}>Report Incident</Text>
        <Text allowFontScaling={false} style={styles.subheading}>
          GPS is captured automatically. Add the incident details and submit.
        </Text>

        <IncidentRefreshButton
          loading={refreshingGps}
          onPress={() => forceRefreshNewIncident(true)}
        />

        <View style={styles.gpsStatusBox}>
          <Ionicons name="locate" size={18} color="#1267e8" />
          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false} style={styles.gpsStatusText}>
              {refreshingGps
                ? "Getting GPS location..."
                : locationSource === "default"
                  ? "GPS not captured. Tap Refresh or drag the pin"
                  : `${locationSource === "gps" ? "GPS" : "Pin"}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${gpsAccuracy ? ` (±${Math.round(gpsAccuracy)} m)` : ""}`}
            </Text>
            {!refreshingGps && locationSource !== "default" && inferredArea ? (
              <Text allowFontScaling={false} style={styles.areaTagText}>
                {inferredArea.subRegion} • {inferredArea.name}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Reporter</Text>

          <View style={styles.profileBox}>
            <Ionicons name="person-circle-outline" size={34} color="#1267e8" />
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={styles.profileName}>
                {profile?.full_name ?? "Loading profile..."}
              </Text>
              <Text allowFontScaling={false} style={styles.profileMeta}>
                {profile?.job_title || profile?.role || "Job title not provided"}
              </Text>
              <Text allowFontScaling={false} style={styles.profileMeta}>
                {(profile?.company ?? "Company") + " • " + (profile?.mobile_number ?? "Mobile")}
              </Text>
            </View>
          </View>
        </View>

        <LeafletLocationPicker
          key={locationPickerKey}
          latitude={latitude}
          longitude={longitude}
          onChange={(payload: any) => {
            const lat = Number(payload.latitude ?? payload.lat);
            const lng = Number(payload.longitude ?? payload.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            setLatitude(lat);
            setLongitude(lng);
            setLocationSource("manual");
            setGpsAccuracy(null);

            if (payload.label) {
              setAddressText(String(payload.label).slice(0, 140));
            }
          }}
        />

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Incident Type</Text>

          <View style={styles.fixedTypeBox}>
            <View style={styles.fixedTypeIcon}>
              <Ionicons name="git-network" size={23} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={styles.fixedTypeTitle}>FR • Fiber Network Risk</Text>
              <Text allowFontScaling={false} style={styles.fixedTypeText}>
                SIRA currently records proactive fiber-risk incidents only.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Severity</Text>

          <View style={styles.severityRow}>
            {SEVERITIES.map((item) => (
              <Pressable
                key={item}
                style={[styles.severityChip, severity === item && styles.severityActive]}
                onPress={() => setSeverity(item)}
              >
                <Text allowFontScaling={false} style={[styles.severityText, severity === item && styles.severityTextActive]}>
                  {item.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>Incident Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Title e.g. Fiber risk near PTCL long haul"
            placeholderTextColor="#94a3b8"
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description / notes"
            placeholderTextColor="#94a3b8"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />

          <TextInput
            style={styles.input}
            placeholder="Location label e.g. G-11 Markaz"
            placeholderTextColor="#94a3b8"
            value={addressText}
            onChangeText={setAddressText}
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

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text allowFontScaling={false} style={styles.cardTitle}>Images</Text>
            <Text allowFontScaling={false} style={styles.photoCount}>{photos.length}/2</Text>
          </View>

          <View style={styles.imageButtonRow}>
            <Pressable style={[styles.imageButton, styles.imageButtonHalf]} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={22} color="#1267e8" />
              <Text allowFontScaling={false} style={styles.imageButtonText}>Take photo</Text>
            </Pressable>

            <Pressable style={[styles.imageButton, styles.imageButtonHalf]} onPress={pickImages}>
              <Ionicons name="images-outline" size={22} color="#1267e8" />
              <Text allowFontScaling={false} style={styles.imageButtonText}>Gallery</Text>
            </Pressable>
          </View>

          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                  <Pressable hitSlop={8} style={styles.photoRemove} onPress={() => removePhoto(index)}>
                    <Ionicons name="close" size={14} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <Pressable style={styles.submitButton} onPress={submitIncident} disabled={submitting || refreshingGps}>
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={23} color="#ffffff" />
              <Text allowFontScaling={false} style={styles.submitText}>Submit Incident</Text>
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
  heading: { color: "#0f172a", fontSize: 34, fontWeight: "900" },
  subheading: { color: "#64748b", fontSize: 14, fontWeight: "800", lineHeight: 20, marginTop: -8 },
  gpsStatusBox: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gpsStatusText: { color: "#334155", fontSize: 13, fontWeight: "900" },
  areaTagText: { color: "#1267e8", fontSize: 10.5, fontWeight: "900", marginTop: 2 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 15,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardTitle: { color: "#0f172a", fontSize: 18, fontWeight: "900", marginBottom: 12 },
  profileBox: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileName: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  profileMeta: { color: "#64748b", fontSize: 13, fontWeight: "800", marginTop: 2 },
  fixedTypeBox: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  fixedTypeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  fixedTypeTitle: { color: "#9a3412", fontSize: 14, fontWeight: "900" },
  fixedTypeText: { color: "#7c2d12", fontSize: 11, fontWeight: "700", marginTop: 2, lineHeight: 16 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  typeChip: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  typeChipActive: { backgroundColor: "#eff6ff", borderColor: "#1267e8" },
  typeText: { color: "#334155", fontSize: 13, fontWeight: "900" },
  typeTextActive: { color: "#1267e8" },
  severityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  severityChip: {
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  severityActive: { backgroundColor: "#1267e8", borderColor: "#1267e8" },
  severityText: { color: "#334155", fontSize: 12, fontWeight: "900" },
  severityTextActive: { color: "#ffffff" },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  textArea: { minHeight: 98, textAlignVertical: "top" },
  supportArea: { minHeight: 150, textAlignVertical: "top" },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoCount: { color: "#64748b", fontSize: 13, fontWeight: "900" },
  imageButton: {
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
  imageButtonText: { color: "#1267e8", fontSize: 14, fontWeight: "900" },
  imageButtonRow: { flexDirection: "row", gap: 10 },
  imageButtonHalf: { flex: 1 },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoStrip: { gap: 10, paddingTop: 12 },
  photoThumb: { width: 92, height: 72, borderRadius: 12, backgroundColor: "#e2e8f0" },
  submitButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#16b96f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  submitText: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
});
