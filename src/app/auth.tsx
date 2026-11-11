import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
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

import { useAuth } from "../context/AuthContext";
import CaptchaWidget, { CAPTCHA_SITE_KEY } from "../../components/CaptchaWidget";
import SiraSignupEntry from "../../components/SiraSignupEntry";

const SIRA_LOGIN_LOCKOUT = "sira_login_lockout";
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

type LoginLockoutState = {
  attempts: number;
  lockedUntil: number;
};

async function getLoginLockoutState(): Promise<LoginLockoutState> {
  try {
    const saved = await AsyncStorage.getItem(SIRA_LOGIN_LOCKOUT);

    if (!saved) {
      return { attempts: 0, lockedUntil: 0 };
    }

    const parsed = JSON.parse(saved) as Partial<LoginLockoutState>;

    return {
      attempts: Number(parsed.attempts) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}
export default function AuthScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Changing the key remounts the check box, giving a fresh one.
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaPending = Boolean(CAPTCHA_SITE_KEY) && !captchaToken;

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaKey((key) => key + 1);
  }

  async function submit() {
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      Alert.alert("Missing fields", "Email and password are required.");
      return;
    }

    let lockout = await getLoginLockoutState();
    const now = Date.now();

    if (lockout.lockedUntil > now) {
      const minutesRemaining = Math.max(
        1,
        Math.ceil((lockout.lockedUntil - now) / 60000)
      );

      Alert.alert(
        "Login temporarily locked",
        `Too many failed attempts. Try again in ${minutesRemaining} minute(s).`
      );
      return;
    }

    if (lockout.lockedUntil > 0) {
      lockout = { attempts: 0, lockedUntil: 0 };
      await AsyncStorage.removeItem(SIRA_LOGIN_LOCKOUT);
    }

    if (captchaPending) {
      Alert.alert("Security check", "Please complete the security check first.");
      return;
    }

    try {
      setLoading(true);
      const result = await signIn(normalizedEmail, password, captchaToken ?? undefined);
      // Each token is single use, so the next attempt needs a new check.
      if (CAPTCHA_SITE_KEY) resetCaptcha();

      if (result.error && result.notCounted) {
        Alert.alert("Login failed", result.error);
        return;
      }

      if (result.error) {
        const nextAttempts = lockout.attempts + 1;

        if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
          await AsyncStorage.setItem(
            SIRA_LOGIN_LOCKOUT,
            JSON.stringify({
              attempts: nextAttempts,
              lockedUntil: Date.now() + LOGIN_LOCKOUT_MS,
            })
          );

          Alert.alert(
            "Login temporarily locked",
            "Too many failed attempts. Try again in 15 minutes."
          );
        } else {
          await AsyncStorage.setItem(
            SIRA_LOGIN_LOCKOUT,
            JSON.stringify({
              attempts: nextAttempts,
              lockedUntil: 0,
            })
          );

          Alert.alert(
            "Login failed",
            `Invalid email or password. ${
              MAX_LOGIN_ATTEMPTS - nextAttempts
            } attempt(s) remaining.`
          );
        }

        return;
      }

      await AsyncStorage.removeItem(SIRA_LOGIN_LOCKOUT);
      router.replace("/(tabs)/incidents" as any);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#071426"
      />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text allowFontScaling={false} style={styles.title}>
                SIRA
              </Text>

              <Text allowFontScaling={false} style={styles.subtitle}>
                Smart Incident Reporting Application
              </Text>

              <Text allowFontScaling={false} style={styles.description}>
                Fiber Risk Field Monitoring
              </Text>
            </View>

            <View style={styles.card}>
              <Text allowFontScaling={false} style={styles.cardTitle}>
                Secure Login
              </Text>

              <Text allowFontScaling={false} style={styles.cardSubtitle}>
                Use your registered email address and password.
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={22}
                  color="#64748b"
                />

                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={22}
                  color="#64748b"
                />

                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={() => submit()}
                />

                <Pressable
                  hitSlop={12}
                  onPress={() =>
                    setShowPassword((currentValue) => !currentValue)
                  }
                >
                  <Ionicons
                    name={
                      showPassword
                        ? "eye-off-outline"
                        : "eye-outline"
                    }
                    size={23}
                    color="#64748b"
                  />
                </Pressable>
              </View>

              {CAPTCHA_SITE_KEY ? (
                <CaptchaWidget
                  key={captchaKey}
                  onToken={setCaptchaToken}
                  onError={(message) => Alert.alert("Security check", message)}
                />
              ) : null}

              <Pressable
                disabled={loading || captchaPending}
                onPress={() => submit()}
                style={({ pressed }) => [
                  styles.loginButton,
                  pressed && !loading && styles.loginButtonPressed,
                  (loading || captchaPending) && styles.loginButtonDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons
                      name="log-in-outline"
                      size={23}
                      color="#ffffff"
                    />

                    <Text
                      allowFontScaling={false}
                      style={styles.loginButtonText}
                    >
                      Login
                    </Text>
                  </>
                )}
              </Pressable>

              <SiraSignupEntry />

              <View style={styles.adminNote}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color="#0f766e"
                />

                <Text
                  allowFontScaling={false}
                  style={styles.adminNoteText}
                >
                  New accounts are created only by the SIRA administrator.
                </Text>
              </View>
            </View>

            <Text allowFontScaling={false} style={styles.footer}>
              Secure field incident reporting
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  screen: {
    flex: 1,
    backgroundColor: "#071426",
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 28,
  },

  header: {
    alignItems: "center",
    marginBottom: 32,
  },

  title: {
    color: "#ffffff",
    fontSize: 54,
    lineHeight: 62,
    fontWeight: "900",
    letterSpacing: 2,
  },

  subtitle: {
    color: "#dbeafe",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
  },

  description: {
    color: "#67e8f9",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 12,
  },

  cardTitle: {
    color: "#0f172a",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },

  cardSubtitle: {
    color: "#64748b",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "700",
    marginTop: 5,
    marginBottom: 10,
  },

  inputContainer: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dbe5f1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 13,
  },

  input: {
    flex: 1,
    color: "#0f172a",
    fontSize: 15.5,
    fontWeight: "700",
  },

  loginButton: {
    height: 60,
    borderRadius: 19,
    backgroundColor: "#1769e8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
  },

  loginButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },

  loginButtonDisabled: {
    opacity: 0.7,
  },

  loginButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  adminNote: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  adminNoteText: {
    flex: 1,
    color: "#0f766e",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },

  footer: {
    color: "#7890ae",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 22,
  },
});
