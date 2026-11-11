import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
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

import CaptchaWidget from "../../components/CaptchaWidget";
import { getFunctionErrorMessage } from "../../lib/functionError";
import { supabase } from "../../lib/supabase";
import {
  getPasswordRules,
  isStrongPassword,
  PASSWORD_POLICY_TEXT,
} from "../../lib/passwordPolicy";

type SignupStatus = {
  signupEnabled?: boolean;
};

function Field({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  secureTextEntry,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
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
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
        placeholderTextColor="#94a3b8"
      />
      {right}
    </View>
  );
}

export default function SignupScreen() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [company, setCompany] = useState("Zong");
  const [jobTitle, setJobTitle] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordRules = useMemo(() => getPasswordRules(password), [password]);

  // Sign-up is verified with hCaptcha on the server.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaKey((key) => key + 1);
  }

  useEffect(() => {
    supabase.functions
      .invoke<SignupStatus>("sira-user-admin", {
        body: { action: "status" },
      })
      .then(({ data, error }) => {
        setSignupEnabled(!error && data?.signupEnabled === true);
      })
      .finally(() => setChecking(false));
  }, []);

  async function submit() {
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = fullName.trim();
    const normalizedCompany = company.trim();
    const normalizedMobile = mobileNumber.trim();
    const normalizedTitle = jobTitle.trim();

    if (
      !normalizedName ||
      !normalizedEmail ||
      !normalizedCompany ||
      !normalizedMobile ||
      !normalizedTitle ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert("Missing fields", "Please complete all fields.");
      return;
    }

    if (!isStrongPassword(password)) {
      Alert.alert("Weak password", PASSWORD_POLICY_TEXT);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "The two passwords do not match.");
      return;
    }

    if (!captchaToken) {
      Alert.alert("Security check", "Please complete the security check first.");
      return;
    }

    try {
      setSubmitting(true);

      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        message?: string;
      }>("sira-user-admin", {
        body: {
          action: "signup",
          email: normalizedEmail,
          password,
          fullName: normalizedName,
          company: normalizedCompany,
          mobileNumber: normalizedMobile,
          jobTitle: normalizedTitle,
          role: normalizedTitle,
          captchaToken,
        },
      });

      // Each token works once, so any further attempt needs a fresh check.
      resetCaptcha();

      if (error || !data?.ok) {
        const serverMessage =
          data?.message || (await getFunctionErrorMessage(error));

        Alert.alert(
          "Sign-up failed",
          serverMessage || "Account could not be created. Please try again."
        );
        return;
      }

      Alert.alert(
        "Account created",
        "Your SIRA account is ready. Please sign in.",
        [
          {
            text: "Continue",
            onPress: () => router.replace("/auth" as never),
          },
        ]
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Register for SIRA access</Text>
          </View>
        </View>

        {checking ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1769e8" />
            <Text style={styles.centerText}>Checking sign-up status...</Text>
          </View>
        ) : !signupEnabled ? (
          <View style={styles.center}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={38} color="#64748b" />
            </View>
            <Text style={styles.disabledTitle}>Sign-up is disabled</Text>
            <Text style={styles.disabledText}>
              A SIRA administrator has temporarily disabled creation of new
              accounts.
            </Text>
            <Pressable
              style={styles.returnButton}
              onPress={() => router.replace("/auth" as never)}
            >
              <Text style={styles.returnButtonText}>Return to Login</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Field
                icon="person-outline"
                placeholder="Full name"
                value={fullName}
                onChangeText={setFullName}
              />
              <Field
                icon="mail-outline"
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              <Field
                icon="call-outline"
                placeholder="Mobile number"
                value={mobileNumber}
                onChangeText={setMobileNumber}
                keyboardType="phone-pad"
              />
              <Field
                icon="business-outline"
                placeholder="Company"
                value={company}
                onChangeText={setCompany}
              />
              <Field
                icon="briefcase-outline"
                placeholder="Job title / role"
                value={jobTitle}
                onChangeText={setJobTitle}
              />
              <Field
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                right={
                  <Pressable
                    hitSlop={12}
                    onPress={() => setShowPassword((value) => !value)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={21}
                      color="#64748b"
                    />
                  </Pressable>
                }
              />
              <Field
                icon="shield-checkmark-outline"
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />

              <View style={styles.rulesBox}>
                {passwordRules.map((rule) => (
                  <View key={rule.key} style={styles.ruleRow}>
                    <Ionicons
                      name={
                        rule.passed
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={17}
                      color={rule.passed ? "#15803d" : "#94a3b8"}
                    />
                    <Text
                      style={[
                        styles.ruleText,
                        rule.passed && styles.ruleTextPassed,
                      ]}
                    >
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>

              <CaptchaWidget
                key={captchaKey}
                onToken={setCaptchaToken}
                onError={(message) => Alert.alert("Security check", message)}
              />

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && !submitting && styles.buttonPressed,
                  (submitting || !captchaToken) && styles.buttonDisabled,
                ]}
                onPress={submit}
                disabled={submitting || !captchaToken}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons
                      name="person-add-outline"
                      size={21}
                      color="#ffffff"
                    />
                    <Text style={styles.submitText}>Create Account</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        )}
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
  subtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  content: { padding: 18, paddingBottom: 34 },
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
  input: {
    flex: 1,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  rulesBox: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#f8fafc",
    gap: 7,
  },
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
  center: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  centerText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
  },
  lockCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  disabledTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 18,
  },
  disabledText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  returnButton: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 17,
    backgroundColor: "#1769e8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  returnButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});
