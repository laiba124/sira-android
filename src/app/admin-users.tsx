import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getFunctionErrorMessage } from "../../lib/functionError";
import { supabase } from "../../lib/supabase";
import {
  isStrongPassword,
  PASSWORD_POLICY_TEXT,
} from "../../lib/passwordPolicy";

type SiraUser = {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  createdAt: string | null;
  fullName: string;
  company: string;
  mobileNumber: string;
  role: string;
  jobTitle: string;
};

type UserForm = {
  id?: string;
  email: string;
  password: string;
  fullName: string;
  company: string;
  mobileNumber: string;
  role: string;
  jobTitle: string;
};

const EMPTY_FORM: UserForm = {
  email: "",
  password: "",
  fullName: "",
  company: "Zong",
  mobileNumber: "",
  role: "",
  jobTitle: "",
};

function safeMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
}) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
      />
    </View>
  );
}

export default function AdminUsersScreen() {
  const router = useRouter();

  const [authorizing, setAuthorizing] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [users, setUsers] = useState<SiraUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [query, setQuery] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [savingUser, setSavingUser] = useState(false);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;

    return users.filter((user) =>
      [
        user.email,
        user.fullName,
        user.company,
        user.mobileNumber,
        user.role,
        user.jobTitle,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [query, users]);

  async function invoke<T>(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke<T>(
      "sira-user-admin",
      { body }
    );

    if (error) {
      throw new Error(
        (await getFunctionErrorMessage(error)) ||
          error.message ||
          "Administrator request failed."
      );
    }

    return data;
  }

  async function authorize() {
    try {
      setAuthorizing(true);
      const data = await invoke<{
        isAdmin?: boolean;
        signupEnabled?: boolean;
      }>({ action: "admin-status" });

      const allowed = data?.isAdmin === true;
      setIsAdmin(allowed);
      setSignupEnabled(data?.signupEnabled === true);

      if (allowed) {
        await loadUsers();
      }
    } catch (error) {
      Alert.alert(
        "Administrator access failed",
        safeMessage(error, "Could not verify administrator access.")
      );
    } finally {
      setAuthorizing(false);
    }
  }

  async function loadUsers() {
    try {
      setLoadingUsers(true);
      const data = await invoke<{ users?: SiraUser[] }>({
        action: "list-users",
      });
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (error) {
      Alert.alert(
        "Users could not load",
        safeMessage(error, "Could not load users.")
      );
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    authorize();
  }, []);

  async function changeSignupEnabled(nextValue: boolean) {
    try {
      setSavingToggle(true);
      const data = await invoke<{ signupEnabled?: boolean }>({
        action: "set-signup",
        signupEnabled: nextValue,
      });
      setSignupEnabled(data?.signupEnabled === true);
    } catch (error) {
      Alert.alert(
        "Setting not changed",
        safeMessage(error, "Could not update sign-up status.")
      );
    } finally {
      setSavingToggle(false);
    }
  }

  function openCreate() {
    setFormMode("create");
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(user: SiraUser) {
    setFormMode("edit");
    setForm({
      id: user.id,
      email: user.email,
      password: "",
      fullName: user.fullName,
      company: user.company || "Zong",
      mobileNumber: user.mobileNumber,
      role: user.role,
      jobTitle: user.jobTitle,
    });
    setModalVisible(true);
  }

  async function saveUser() {
    const normalized = {
      ...form,
      email: form.email.trim().toLowerCase(),
      fullName: form.fullName.trim(),
      company: form.company.trim(),
      mobileNumber: form.mobileNumber.trim(),
      role: form.role.trim() || form.jobTitle.trim() || "Field Engineer",
      jobTitle: form.jobTitle.trim(),
    };

    if (
      !normalized.email ||
      !normalized.fullName ||
      !normalized.company ||
      !normalized.mobileNumber ||
      !normalized.jobTitle
    ) {
      Alert.alert("Missing fields", "Please complete all required fields.");
      return;
    }

    if (formMode === "create" && !normalized.password) {
      Alert.alert("Password required", PASSWORD_POLICY_TEXT);
      return;
    }

    if (normalized.password && !isStrongPassword(normalized.password)) {
      Alert.alert("Weak password", PASSWORD_POLICY_TEXT);
      return;
    }

    try {
      setSavingUser(true);

      await invoke<{ ok?: boolean }>({
        action: formMode === "create" ? "create-user" : "update-user",
        userId: normalized.id,
        email: normalized.email,
        password: normalized.password || undefined,
        fullName: normalized.fullName,
        company: normalized.company,
        mobileNumber: normalized.mobileNumber,
        role: normalized.role,
        jobTitle: normalized.jobTitle,
      });

      setModalVisible(false);
      await loadUsers();
    } catch (error) {
      Alert.alert(
        formMode === "create" ? "User not created" : "User not updated",
        safeMessage(error, "Administrator operation failed.")
      );
    } finally {
      setSavingUser(false);
    }
  }

  function requestDelete(user: SiraUser) {
    Alert.alert(
      "Delete user",
      `Delete ${user.fullName || user.email}? This removes access to SIRA.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await invoke<{ ok?: boolean }>({
                action: "delete-user",
                userId: user.id,
              });
              setUsers((current) =>
                current.filter((item) => item.id !== user.id)
              );
            } catch (error) {
              Alert.alert(
                "User not deleted",
                safeMessage(error, "Administrator operation failed.")
              );
            }
          },
        },
      ]
    );
  }

  if (authorizing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.centerText}>Verifying administrator access...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="shield-outline" size={54} color="#94a3b8" />
          <Text style={styles.deniedTitle}>Administrator access required</Text>
          <Text style={styles.deniedText}>
            This area is restricted to the designated SIRA administrators.
          </Text>
          <Pressable style={styles.backSolid} onPress={() => router.back()}>
            <Text style={styles.backSolidText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={23} color="#0f172a" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>User Administration</Text>
          <Text style={styles.headerSubtitle}>
            Create, update, delete and control sign-up
          </Text>
        </View>
        <Pressable style={styles.addButton} onPress={openCreate}>
          <Ionicons name="person-add" size={21} color="#ffffff" />
        </Pressable>
      </View>

      <View style={styles.settingCard}>
        <View style={styles.settingIcon}>
          <Ionicons name="person-add-outline" size={22} color="#0f766e" />
        </View>
        <View style={styles.settingCopy}>
          <Text style={styles.settingTitle}>Public Sign-up</Text>
          <Text style={styles.settingText}>
            {signupEnabled
              ? "New users can create accounts."
              : "Only administrators can create users."}
          </Text>
        </View>
        {savingToggle ? (
          <ActivityIndicator color="#0f766e" />
        ) : (
          <Switch
            value={signupEnabled}
            onValueChange={changeSignupEnabled}
            trackColor={{ false: "#cbd5e1", true: "#99f6e4" }}
            thumbColor={signupEnabled ? "#0f766e" : "#64748b"}
          />
        )}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users"
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.countText}>{filteredUsers.length}</Text>
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingUsers}
            onRefresh={loadUsers}
            tintColor="#0f766e"
          />
        }
        ListEmptyComponent={
          loadingUsers ? null : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={42} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No users found</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.fullName || item.email).slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userCopy}>
              <Text numberOfLines={1} style={styles.userName}>
                {item.fullName || "Unnamed user"}
              </Text>
              <Text numberOfLines={1} style={styles.userEmail}>
                {item.email}
              </Text>
              <Text numberOfLines={1} style={styles.userMeta}>
                {[item.company, item.jobTitle || item.role]
                  .filter(Boolean)
                  .join(" • ")}
              </Text>
            </View>
            <Pressable
              style={styles.rowAction}
              onPress={() => openEdit(item)}
            >
              <Ionicons name="create-outline" size={21} color="#1769e8" />
            </Pressable>
            <Pressable
              style={[styles.rowAction, styles.deleteAction]}
              onPress={() => requestDelete(item)}
            >
              <Ionicons name="trash-outline" size={20} color="#dc2626" />
            </Pressable>
          </View>
        )}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {formMode === "create" ? "Create User" : "Update User"}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {formMode === "create"
                    ? "Add a new SIRA account"
                    : "Edit account and profile details"}
                </Text>
              </View>
              <Pressable
                style={styles.modalClose}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={23} color="#0f172a" />
              </Pressable>
            </View>

            <FlatList
              data={[{ key: "form" }]}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              renderItem={() => (
                <View style={styles.formContent}>
                  <FormInput
                    label="Full name"
                    value={form.fullName}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, fullName: value }))
                    }
                    placeholder="Full name"
                  />
                  <FormInput
                    label="Email"
                    value={form.email}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, email: value }))
                    }
                    placeholder="user@example.com"
                    keyboardType="email-address"
                  />
                  <FormInput
                    label={
                      formMode === "create"
                        ? "Password"
                        : "New password (optional)"
                    }
                    value={form.password}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, password: value }))
                    }
                    placeholder="Minimum 12 characters"
                    secureTextEntry
                  />
                  <FormInput
                    label="Mobile number"
                    value={form.mobileNumber}
                    onChangeText={(value) =>
                      setForm((current) => ({
                        ...current,
                        mobileNumber: value,
                      }))
                    }
                    placeholder="923001234567"
                    keyboardType="phone-pad"
                  />
                  <FormInput
                    label="Company"
                    value={form.company}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, company: value }))
                    }
                    placeholder="Zong"
                  />
                  <FormInput
                    label="Job title"
                    value={form.jobTitle}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, jobTitle: value }))
                    }
                    placeholder="Job title"
                  />
                  <FormInput
                    label="Role"
                    value={form.role}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, role: value }))
                    }
                    placeholder="Role"
                  />
                  <Text style={styles.policyText}>{PASSWORD_POLICY_TEXT}</Text>

                  <Pressable
                    style={[
                      styles.saveButton,
                      savingUser && styles.saveButtonDisabled,
                    ]}
                    onPress={saveUser}
                    disabled={savingUser}
                  >
                    {savingUser ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons
                          name="save-outline"
                          size={20}
                          color="#ffffff"
                        />
                        <Text style={styles.saveButtonText}>
                          {formMode === "create"
                            ? "Create User"
                            : "Save Changes"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    minHeight: 76,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, marginLeft: 12 },
  headerTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  headerSubtitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  settingCard: {
    margin: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe5f0",
    flexDirection: "row",
    alignItems: "center",
  },
  settingIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  settingCopy: { flex: 1, marginHorizontal: 12 },
  settingTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  settingText: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  searchWrap: {
    minHeight: 52,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  countText: {
    minWidth: 28,
    textAlign: "center",
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  userCard: {
    minHeight: 82,
    padding: 12,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#1769e8", fontSize: 19, fontWeight: "900" },
  userCopy: { flex: 1, marginLeft: 11 },
  userName: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  userEmail: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  userMeta: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },
  rowAction: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  deleteAction: { backgroundColor: "#fef2f2" },
  empty: { alignItems: "center", paddingVertical: 55 },
  emptyTitle: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 10,
  },
  center: {
    flex: 1,
    paddingHorizontal: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  centerText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
  },
  deniedTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 14,
  },
  deniedText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "700",
    marginTop: 7,
  },
  backSolid: {
    minHeight: 50,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  backSolidText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "92%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  modalHeader: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  modalTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  modalSubtitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  modalClose: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  formContent: { padding: 18, paddingBottom: 34 },
  formGroup: { marginBottom: 12 },
  formLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },
  formInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  policyText: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  saveButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 16,
  },
  saveButtonDisabled: { opacity: 0.65 },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
});
