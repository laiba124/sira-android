import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, usePathname } from "expo-router";
import { useCallback, useState } from "react";
import {
  ImageBackground,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../src/context/AuthContext";
import { countNewAlerts, markAlertsSeen } from "../lib/alertBadge";

const BADGE_REFRESH_MS = 60 * 1000;

// Banner art with the brand built in; menu, alerts and settings are real
// buttons drawn on top so the badge stays live.
const HERO_IMAGE = require("../assets/images/sira-incidents-header.png");

type MenuItem = {
  title: string;
  subtitle: string;
  href: string;
  match: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const MENU_ITEMS: MenuItem[] = [
  {
    title: "Incident Map",
    subtitle: "View live fiber-risk incidents",
    href: "/(tabs)/map",
    match: "ROOT_MAP",
    icon: "map-outline",
  },
  {
    title: "Incident Dashboard",
    subtitle: "Incident status, severity and areas",
    href: "/(tabs)/dashboard",
    match: "dashboard",
    icon: "grid-outline",
  },
  {
    title: "Incidents",
    subtitle: "Search and review reported incidents",
    href: "/(tabs)/incidents",
    match: "incidents",
    icon: "list-outline",
  },
  {
    title: "Report Incident",
    subtitle: "Create a new incident report",
    href: "/(tabs)/report",
    match: "report",
    icon: "add-circle-outline",
  },
  {
    title: "Alerts",
    subtitle: "Review notifications and updates",
    href: "/(tabs)/alerts",
    match: "alerts",
    icon: "notifications-outline",
  },
  {
    title: "More",
    subtitle: "Profile and application settings",
    href: "/(tabs)/more",
    match: "more",
    icon: "ellipsis-horizontal-circle-outline",
  },
];

export default function SiraTopBar({
  back = false,
  variant = "default",
}: {
  back?: boolean;
  variant?: "default" | "hero";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const onAlertsScreen = pathname.includes("alerts");

  // Refreshes while the screen is focused; opening Alerts clears the badge.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function refreshBadge() {
        if (onAlertsScreen) {
          await markAlertsSeen();
          if (active) setNotificationCount(0);
          return;
        }
        const count = await countNewAlerts(userId);
        if (active) setNotificationCount(count);
      }

      refreshBadge();
      const timer = setInterval(refreshBadge, BADGE_REFRESH_MS);

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [onAlertsScreen, userId])
  );

  // Screens opened on top of a tab (incident detail, edit) go back to where
  // the user came from; opened directly, they fall back to the list.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/incidents" as any);
  }

  function navigate(href: string) {
    setMenuOpen(false);
    requestAnimationFrame(() => router.push(href as any));
  }

  function isActive(item: MenuItem) {
    if (item.match === "ROOT_MAP") {
      return (
        pathname === "/" ||
        pathname === "/map" ||
        pathname.endsWith("/map")
      );
    }
    return pathname.includes(item.match);
  }

  return (
    <>
      <StatusBar barStyle={variant === "hero" ? "light-content" : "dark-content"} />

      {variant === "hero" ? (
        <ImageBackground
          source={HERO_IMAGE}
          resizeMode="cover"
          style={styles.hero}
          accessibilityRole="header"
          accessibilityLabel="SIRA Smart Incident Reporting"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            hitSlop={10}
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
          >
            <Ionicons name="menu" size={30} color="#ffffff" />
          </Pressable>

          <View style={styles.heroActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open alerts"
              hitSlop={8}
              onPress={() => navigate("/(tabs)/alerts")}
              style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
            >
              <Ionicons name="notifications-outline" size={26} color="#ffffff" />
              {notificationCount > 0 ? (
                <View style={[styles.badge, styles.heroBadge]}>
                  <Text allowFontScaling={false} style={styles.badgeText}>
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              hitSlop={8}
              onPress={() => navigate("/(tabs)/more")}
              style={({ pressed }) => [styles.heroSettings, pressed && styles.pressed]}
            >
              <Ionicons name="settings" size={22} color="#ffffff" />
            </Pressable>
          </View>
        </ImageBackground>
      ) : null}

      <View style={[styles.header, variant === "hero" && styles.hidden]}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={goBack}
            style={({ pressed }) => [
              styles.headerButton,
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="arrow-back" size={22} color="#1267e8" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            hitSlop={10}
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="menu" size={27} color="#0f172a" />
          </Pressable>
        )}

        <View style={styles.logoCircle}>
          <Ionicons name="radio" size={20} color="#0e7490" />
        </View>

        <View style={styles.brandWrap}>
          <Text allowFontScaling={false} style={styles.brand}>
            SIRA
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.subtitle}>
            Smart Incident Reporting
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open alerts"
          hitSlop={8}
          onPress={() => navigate("/(tabs)/alerts")}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="notifications-outline" size={24} color="#0f172a" />
          {notificationCount > 0 ? (
            <View style={styles.badge}>
              <Text allowFontScaling={false} style={styles.badgeText}>
                {notificationCount > 99 ? "99+" : notificationCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={8}
          onPress={() => navigate("/(tabs)/more")}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="settings-outline" size={24} color="#0f172a" />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close navigation menu"
            style={styles.backdrop}
            onPress={() => setMenuOpen(false)}
          />

          <View
            style={[
              styles.drawer,
              {
                paddingTop: Math.max(insets.top, 18),
                paddingBottom: Math.max(insets.bottom, 18),
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View style={styles.drawerLogo}>
                <Ionicons name="radio" size={28} color="#ffffff" />
              </View>

              <View style={styles.drawerBrandWrap}>
                <Text allowFontScaling={false} style={styles.drawerBrand}>
                  SIRA
                </Text>
                <Text allowFontScaling={false} style={styles.drawerSubtitle}>
                  Smart Incident Reporting
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                onPress={() => setMenuOpen(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={24} color="#334155" />
              </Pressable>
            </View>

            <Text allowFontScaling={false} style={styles.sectionLabel}>
              NAVIGATION
            </Text>

            <View style={styles.menuList}>
              {MENU_ITEMS.map((item) => {
                const active = isActive(item);

                return (
                  <Pressable
                    key={item.title}
                    accessibilityRole="button"
                    onPress={() => navigate(item.href)}
                    style={({ pressed }) => [
                      styles.menuItem,
                      active && styles.menuItemActive,
                      pressed && styles.menuItemPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.menuIcon,
                        active && styles.menuIconActive,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={23}
                        color={active ? "#ffffff" : "#1267e8"}
                      />
                    </View>

                    <View style={styles.menuText}>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.menuTitle,
                          active && styles.menuTitleActive,
                        ]}
                      >
                        {item.title}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        numberOfLines={2}
                        style={styles.menuSubtitle}
                      >
                        {item.subtitle}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={active ? "#1267e8" : "#94a3b8"}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.drawerFooter}>
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color="#0f766e"
              />
              <Text allowFontScaling={false} style={styles.drawerFooterText}>
                Connected to the central SIRA Supabase database
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  hidden: {
    display: "none",
  },
  hero: {
    width: "100%",
    aspectRatio: 825 / 330,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: "#000c2c",
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  heroBadge: {
    borderColor: "#000c2c",
  },
  heroSettings: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#1267e8",
    shadowColor: "#1267e8",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  backButton: {
    backgroundColor: "#eff6ff",
  },
  logoCircle: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    borderWidth: 2.5,
    borderColor: "#22d3ee",
    borderRadius: 19,
    backgroundColor: "#ecfeff",
  },
  brandWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  brand: {
    color: "#0f172a",
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    borderRadius: 9,
    backgroundColor: "#ef4444",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.68,
  },
  modalRoot: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  drawer: {
    width: "84%",
    maxWidth: 370,
    height: "100%",
    paddingHorizontal: 16,
    backgroundColor: "#f8fafc",
    shadowColor: "#000000",
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 24,
  },
  drawerHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#dbe4ee",
  },
  drawerLogo: {
    width: 49,
    height: 49,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 25,
    backgroundColor: "#12529a",
  },
  drawerBrandWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  drawerBrand: {
    color: "#0f172a",
    fontSize: 25,
    lineHeight: 28,
    fontWeight: "900",
  },
  drawerSubtitle: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#e2e8f0",
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 6,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  menuList: {
    gap: 7,
  },
  menuItem: {
    minHeight: 69,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 17,
    backgroundColor: "#ffffff",
  },
  menuItemActive: {
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  menuItemPressed: {
    opacity: 0.72,
  },
  menuIcon: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#eaf2ff",
  },
  menuIconActive: {
    backgroundColor: "#1267e8",
  },
  menuText: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 11,
  },
  menuTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  menuTitleActive: {
    color: "#12529a",
  },
  menuSubtitle: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  drawerFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: "auto",
    padding: 13,
    borderWidth: 1,
    borderColor: "#99f6e4",
    borderRadius: 15,
    backgroundColor: "#f0fdfa",
  },
  drawerFooterText: {
    flex: 1,
    color: "#0f766e",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
  },
});
