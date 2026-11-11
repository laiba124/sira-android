import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../context/AuthContext";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);
  const { session } = useAuth();

  // A temporary or non-compliant password must be replaced first. The
  // database blocks incident data for these accounts as well.
  if (session?.user?.app_metadata?.must_change_password === true) {
    return <Redirect href={"/change-password?required=1" as never} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "#334155",
        tabBarActiveBackgroundColor: "#1267e8",
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 13,
          fontWeight: "800",
          marginTop: 1,
        },
        tabBarItemStyle: {
          marginHorizontal: 2,
          marginVertical: 2,
          paddingTop: 3,
          borderRadius: 16,
          overflow: "hidden",
        },
        tabBarStyle: {
          height: 66 + bottomInset,
          paddingTop: 6,
          paddingHorizontal: 6,
          paddingBottom: bottomInset,
          borderTopWidth: 1,
          borderTopColor: "#dbe4ee",
          backgroundColor: "#ffffff",
          elevation: 12,
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.12,
          shadowRadius: 7,
        },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarAccessibilityLabel: "Map",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "map" : "map-outline"}
              color={color}
              size={26}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarAccessibilityLabel: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "grid" : "grid-outline"}
              color={color}
              size={26}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: "Incidents",
          tabBarAccessibilityLabel: "Incidents",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "list" : "list-outline"}
              color={color}
              size={26}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "Report",
          tabBarAccessibilityLabel: "Report",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "add-circle" : "add-circle-outline"}
              color={color}
              size={26}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarAccessibilityLabel: "Alerts",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "notifications" : "notifications-outline"}
              color={color}
              size={26}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarAccessibilityLabel: "More",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={
                focused
                  ? "ellipsis-horizontal-circle"
                  : "ellipsis-horizontal-circle-outline"
              }
              color={color}
              size={26}
            />
          ),
        }}
      />
    </Tabs>
  );
}
