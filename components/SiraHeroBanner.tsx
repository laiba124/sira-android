import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ImageBackground,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../src/context/AuthContext";

const SIRA_INCIDENT_HERO =
  require("../assets/images/sira-incidents-hero.png");

type TabPath =
  | "/(tabs)/map"
  | "/(tabs)/incidents"
  | "/(tabs)/report"
  | "/(tabs)/alerts"
  | "/(tabs)/more";

export default function SiraHeroBanner() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);

  function navigateFromMenu(path: TabPath) {
    /*
      Close the menu first.

      No navigation happens when the hamburger is tapped.
      Navigation only happens when one of the menu items is tapped.
    */
    setMenuOpen(false);

    setTimeout(() => {
      if (path === "/(tabs)/report") {
        router.push({
          pathname: "/(tabs)/report",
          params: {
            mode: "new",
            resetKey: Date.now().toString(),
          },
        } as any);

        return;
      }

      router.replace(path as any);
    }, 120);
  }

  async function logout() {
    setMenuOpen(false);
    await signOut();
    router.replace("/auth" as any);
  }

  return (
    <>
      <View style={styles.shell}>
        <ImageBackground
          source={SIRA_INCIDENT_HERO}
          resizeMode="cover"
          style={styles.hero}
          imageStyle={styles.heroImage}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open SIRA menu"
            style={styles.menuButton}
            android_ripple={{
              color: "rgba(255,255,255,0.16)",
              borderless: true,
            }}
            onPress={() => setMenuOpen(true)}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open SIRA alerts"
            style={styles.alertButton}
            android_ripple={{
              color: "rgba(255,255,255,0.16)",
              borderless: true,
            }}
            onPress={() =>
              router.replace("/(tabs)/alerts" as any)
            }
          />
        </ImageBackground>

        <View
          pointerEvents="none"
          style={styles.bottomCurve}
        />
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close SIRA menu"
            style={styles.scrim}
            onPress={() => setMenuOpen(false)}
          />

          <SafeAreaView
            style={styles.drawer}
            edges={["top", "bottom"]}
          >
            <View style={styles.drawerHead}>
              <View style={styles.drawerAvatar}>
                <Ionicons
                  name="person"
                  size={25}
                  color="#ffffff"
                />
              </View>

              <View style={styles.drawerProfile}>
                <Text
                  allowFontScaling={false}
                  style={styles.drawerName}
                >
                  {profile?.full_name ?? "SIRA User"}
                </Text>

                <Text
                  allowFontScaling={false}
                  style={styles.drawerMeta}
                >
                  {(profile?.company ?? "Company") +
                    " • " +
                    (profile?.mobile_number ?? "Mobile")}
                </Text>
              </View>
            </View>

            <MenuItem
              icon="map"
              label="Map"
              onPress={() =>
                navigateFromMenu("/(tabs)/map")
              }
            />

            <MenuItem
              icon="list"
              label="Incidents"
              onPress={() =>
                navigateFromMenu("/(tabs)/incidents")
              }
            />

            <MenuItem
              icon="add-circle"
              label="Report Incident"
              onPress={() =>
                navigateFromMenu("/(tabs)/report")
              }
            />

            <MenuItem
              icon="notifications"
              label="Alerts"
              onPress={() =>
                navigateFromMenu("/(tabs)/alerts")
              }
            />

            <MenuItem
              icon="ellipsis-horizontal"
              label="More"
              onPress={() =>
                navigateFromMenu("/(tabs)/more")
              }
            />

            <View style={styles.divider} />

            <MenuItem
              icon="log-out-outline"
              label="Logout"
              danger
              onPress={logout}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.menuItem}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? "#dc2626" : "#1267e8"}
      />

      <Text
        allowFontScaling={false}
        style={[
          styles.menuText,
          danger && styles.dangerText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    backgroundColor: "#06162f",
    position: "relative",
    marginBottom: -12,
    zIndex: 2,
  },

  hero: {
    width: "100%",
    aspectRatio: 1080 / 622,
    position: "relative",
  },

  heroImage: {
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },

  menuButton: {
    position: "absolute",
    left: 5,
    top: 3,
    width: 65,
    height: 70,
    borderRadius: 24,
  },

  alertButton: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 68,
    height: 72,
    borderRadius: 28,
  },

  bottomCurve: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 16,
    backgroundColor: "#f5f7fb",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.48)",
  },

  scrim: {
    ...StyleSheet.absoluteFillObject,
  },

  drawer: {
    width: "82%",
    height: "100%",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  drawerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 8,
  },

  drawerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1267e8",
    alignItems: "center",
    justifyContent: "center",
  },

  drawerProfile: {
    flex: 1,
  },

  drawerName: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },

  drawerMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },

  menuItem: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 10,
  },

  menuText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },

  dangerText: {
    color: "#dc2626",
  },

  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 10,
  },
});