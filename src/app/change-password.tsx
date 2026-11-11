import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getFunctionErrorMessage } from "../../lib/functionError";
import { getPasswordRules, isStrongPassword, PASSWORD_POLICY_TEXT } from "../../lib/passwordPolicy";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";

function Field({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name={icon} size={20} color="#64748b" />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholderTextColor="#94a3b8"
      />
      {right}
    </View>
  );
}

// Used from the More tab, and shown automatically (with no way back) when an
// administrator has set a temporary password that must be replaced.
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { required } = useLocalSearchParams<{ required?: string }>();
  const { session, signOut } = useAuth();
  const mustChange =
    required === "1" || session?.user?.app_metadata?.must_change_password === true;

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordRules = useMemo(() => getPasswordRules(password), [password]);

  async function submit() {
    if (submitting) return;

    if (!currentPassword || !password || !confirmPassword) {
      Alert.alert("Missing fields", "Please complete all fields.");
      return;
    }
    if (!isStrongPassword(password)) {
      Alert.alert("Weak password", PASSWORD_POLICY_TEXT);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "The two new passwords do not match.");
      return;
    }
    if (password === currentPassword) {
      Alert.alert("Choose a new password", "The new password must be different from the current one.");
      return;
    }

    try {
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; message?: string }>(
        "sira-user-admin",
        { body: { action: "change-password", currentPassword, password } }
      );

      if (error || !data?.ok) {
        const serverMessage = data?.message || (await getFunctionErrorMessage(error));
        Alert.alert("Password not changed", serverMessage || "Please try again.");
        return;
      }

      // Pick up the cleared must-change flag in a fresh token.
      await supabase.auth.refreshSession();
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");

      Alert.alert("Password changed", "Your new password is now active.", [
        { text: "Continue", onPress: () => router.replace("/(tabs)/incidents" as never) },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await signOut();
    router.replace("/auth" as never);
  }

  const eye = (
    <Pressable hitSlop={12} onPress={() => setShowPassword((value) => !value)}>
      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#64748b" />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          {mustChange ? null : (
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#0f172a" />
            </Pressable>
          )}
          <View style={[styles.headerText, mustChange && { marginLeft: 0 }]}>
            <Text style={styles.title}>Change Password</Text>
            <Text style={styles.subtitle}>
              {mustChange ? "Set a new password to continue" : "Update your SIRA password"}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {mustChange ? (
            <View style={styles.notice}>
              <Ionicons name="shield-half-outline" size={19} color="#b45309" />
              <Text style={styles.noticeText}>
                Your password was set by an administrator or no longer meets the SIRA policy. Choose a new password to continue.
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Field
              icon="key-outline"
              placeholder="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showPassword}
              right={eye}
            />
            <Field
              icon="lock-closed-outline"
              placeholder="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <Field
              icon="shield-checkmark-outline"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
            />

            <View style={styles.rulesBox}>
              {passwordRules.map((rule) => (
                <View key={rule.key} style={styles.ruleRow}>
                  <Ionicons
                    name={rule.passed ? "checkmark-circle" : "ellipse-outline"}
                    size={17}
                    color={rule.passed ? "#15803d" : "#94a3b8"}
                  />
                  <Text style={[styles.ruleText, rule.passed && styles.ruleTextPassed]}>{rule.label}</Text>
                </View>
              ))}
              <View style={styles.ruleRow}>
                <Ionicons name="information-circle-outline" size={17} color="#94a3b8" />
                <Text style={styles.ruleText}>Must not contain your email name</Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                pressed && !submitting && styles.buttonPressed,
                submitting && styles.buttonDisabled,
              ]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={21} color="#ffffff" />
                  <Text style={styles.submitText}>Save New Password</Text>
                </>
              )}
            </Pressable>

            {mustChange ? (
              <Pressable style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    minHeight: 74,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { marginLeft: 13 },
  title: { color: "#0f172a", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 12, fontWeight: "700", marginTop: 2 },
  content: { padding: 18, paddingBottom: 34 },
  notice: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    flexDirection: "row",
    gap: 9,
  },
  noticeText: { flex: 1, color: "#92400e", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  card: {
    borderRadius: 24,
    padding: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inputWrap: {
    minHeight: 56,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  input: { flex: 1, color: "#0f172a", fontSize: 15, fontWeight: "700" },
  rulesBox: { borderRadius: 16, padding: 12, backgroundColor: "#f8fafc", gap: 7 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleText: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  ruleTextPassed: { color: "#15803d" },
  submitButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#1769e8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 16,
  },
  submitText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  buttonPressed: { opacity: 0.84 },
  buttonDisabled: { opacity: 0.68 },
  logoutButton: { alignItems: "center", justifyContent: "center", minHeight: 46, marginTop: 8 },
  logoutText: { color: "#64748b", fontSize: 14, fontWeight: "800" },
});
