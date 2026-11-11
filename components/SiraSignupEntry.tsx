import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";

type SignupStatus = {
  signupEnabled?: boolean;
};

export default function SiraSignupEntry() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.functions
      .invoke<SignupStatus>("sira-user-admin", {
        body: { action: "status" },
      })
      .then(({ data, error }) => {
        if (!mounted) return;
        setEnabled(!error && data?.signupEnabled === true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator size="small" color="#1769e8" />
        <Text style={styles.statusText}>Checking sign-up availability...</Text>
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={styles.disabledNote}>
        <Ionicons name="lock-closed-outline" size={17} color="#64748b" />
        <Text style={styles.disabledText}>
          New user sign-up is currently disabled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.line} />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/signup" as never)}
      >
        <Ionicons name="person-add-outline" size={20} color="#1769e8" />
        <Text style={styles.buttonText}>Create New Account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#dbe5f0",
  },
  orText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "900",
  },
  button: {
    height: 54,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#bfd5f7",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: "#1769e8",
    fontSize: 15,
    fontWeight: "900",
  },
  statusRow: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  statusText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  disabledNote: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  disabledText: {
    flex: 1,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
});
