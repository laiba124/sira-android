import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { supabase } from "../lib/supabase";

// Administrator status comes from the server (sira_admins, keyed by user id).
// This only decides whether admin entry points are shown; every admin action
// is still authorised by the Edge Function.
export function useIsSiraAdmin(userId: string | null | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsAdmin(false);
    if (!userId) return;

    supabase.functions
      .invoke<{ isAdmin?: boolean }>("sira-user-admin", {
        body: { action: "admin-status" },
      })
      .then(({ data, error }) => {
        if (mounted) setIsAdmin(!error && data?.isAdmin === true);
      })
      .catch(() => {
        if (mounted) setIsAdmin(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

  return isAdmin;
}

export default function SiraAdminShortcut() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const visible = useIsSiraAdmin(userId);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!visible) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
      onPress={() => router.push("/admin-users" as never)}
    >
      <Ionicons name="shield-checkmark" size={21} color="#ffffff" />
      <Text style={styles.text}>Admin Console</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 18,
    bottom: 82,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  buttonPressed: {
    opacity: 0.84,
  },
  text: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
});
