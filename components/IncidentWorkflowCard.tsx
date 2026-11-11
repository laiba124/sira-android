import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ACTION_PLAN_FORMULATION_OPTIONS,
  getSubStages,
  INCIDENT_STAGES,
  isActionPlanOption,
  normalizeIncidentStage,
  normalizeIncidentSubStage,
  type ActionPlanOption,
  type IncidentStage,
  type IncidentSubStage,
} from "../lib/incidentWorkflow";

type Props = {
  stage?: string | null;
  subStage?: string | null;
  actionPlan?: string | null;
  threatDetails?: string | null;
  actionPlanDetails?: string | null;
  canEdit: boolean;
  saving?: boolean;
  onSave: (payload: {
    stage: IncidentStage;
    subStage: IncidentSubStage;
    actionPlan: ActionPlanOption | null;
    threatDetails: string | null;
    actionPlanDetails: string | null;
  }) => Promise<boolean | void>;
};

type DropdownKey = "stage" | "subStage" | "actionPlan" | null;

export default function IncidentWorkflowCard({
  stage,
  subStage,
  actionPlan,
  threatDetails,
  actionPlanDetails,
  canEdit,
  saving = false,
  onSave,
}: Props) {
  const currentStage = normalizeIncidentStage(stage);
  const currentSubStage = normalizeIncidentSubStage(currentStage, subStage);
  const currentActionPlan = isActionPlanOption(actionPlan) ? actionPlan : null;
  const currentThreatDetails = String(threatDetails ?? "").trim();
  const currentActionPlanDetails = String(actionPlanDetails ?? "").trim();

  const [visible, setVisible] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);
  const [draftStage, setDraftStage] = useState<IncidentStage>(currentStage);
  const [draftSubStage, setDraftSubStage] =
    useState<IncidentSubStage>(currentSubStage);
  const [draftActionPlan, setDraftActionPlan] =
    useState<ActionPlanOption | null>(currentActionPlan);
  const [draftThreatDetails, setDraftThreatDetails] = useState(currentThreatDetails);
  const [draftActionPlanDetails, setDraftActionPlanDetails] =
    useState(currentActionPlanDetails);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );

  const subStageOptions = useMemo(
    () => getSubStages(draftStage),
    [draftStage],
  );

  useEffect(() => {
    if (!visible) {
      setDraftStage(currentStage);
      setDraftSubStage(currentSubStage);
      setDraftActionPlan(currentActionPlan);
      setDraftThreatDetails(currentThreatDetails);
      setDraftActionPlanDetails(currentActionPlanDetails);
      setOpenDropdown(null);
      setValidationMessage(null);
    }
  }, [
    visible,
    currentStage,
    currentSubStage,
    currentActionPlan,
    currentThreatDetails,
    currentActionPlanDetails,
  ]);

  function chooseStage(nextStage: IncidentStage) {
    setDraftStage(nextStage);
    setDraftSubStage(getSubStages(nextStage)[0]);
    if (nextStage === "Threat") {
      setDraftActionPlan(null);
    }
    setOpenDropdown(null);
    setValidationMessage(null);
  }

  function chooseSubStage(nextSubStage: IncidentSubStage) {
    setDraftSubStage(nextSubStage);
    setOpenDropdown(null);
    setValidationMessage(null);
  }

  async function save() {
    let nextActionPlan = draftActionPlan;

    if (draftStage === "Threat") {
      nextActionPlan = null;
    }

    if (
      draftStage === "Action Plan" &&
      draftSubStage === "Formulation" &&
      !nextActionPlan
    ) {
      setValidationMessage("Select an Action Plan before saving Formulation.");
      return;
    }

    if (
      draftStage === "Action Plan" &&
      draftSubStage === "Implementation" &&
      !nextActionPlan
    ) {
      setValidationMessage(
        "An Action Plan must be formulated before moving to Implementation.",
      );
      return;
    }

    setValidationMessage(null);
    const result = await onSave({
      stage: draftStage,
      subStage: draftSubStage,
      actionPlan: nextActionPlan,
      threatDetails: draftThreatDetails.trim() || null,
      actionPlanDetails: draftActionPlanDetails.trim() || null,
    });

    if (result !== false) {
      setVisible(false);
    }
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="git-branch-outline" size={21} color="#1267e8" />
          </View>
          <View style={styles.headerTextWrap}>
            <Text allowFontScaling={false} style={styles.title}>
              Stage / Sub-stage
            </Text>
            <Text allowFontScaling={false} style={styles.subtitle}>
              Current incident workflow position
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}>
            <Text allowFontScaling={false} style={styles.label}>
              STAGE
            </Text>
            <Text allowFontScaling={false} style={styles.value}>
              {currentStage}
            </Text>
          </View>

          <View style={styles.summaryBox}>
            <Text allowFontScaling={false} style={styles.label}>
              SUB-STAGE
            </Text>
            <Text allowFontScaling={false} style={styles.value}>
              {currentSubStage}
            </Text>
          </View>
        </View>

        {currentActionPlan ? (
          <View style={styles.actionPlanBox}>
            <Text allowFontScaling={false} style={styles.label}>
              ACTION PLAN
            </Text>
            <Text allowFontScaling={false} style={styles.actionPlanValue}>
              {currentActionPlan}
            </Text>
          </View>
        ) : null}

        <View style={styles.stageTextGrid}>
          <View style={styles.stageTextBox}>
            <Text allowFontScaling={false} style={styles.label}>
              THREAT DETAILS
            </Text>
            <Text allowFontScaling={false} style={styles.stageTextValue}>
              {currentThreatDetails || "Not entered"}
            </Text>
          </View>

          <View style={styles.stageTextBox}>
            <Text allowFontScaling={false} style={styles.label}>
              ACTION PLAN DETAILS
            </Text>
            <Text allowFontScaling={false} style={styles.stageTextValue}>
              {currentActionPlanDetails || "Not entered"}
            </Text>
          </View>
        </View>

        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            style={({ pressed }) => [
              styles.updateButton,
              saving && styles.disabledButton,
              pressed && !saving && styles.pressed,
            ]}
            onPress={() => setVisible(true)}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#1267e8" />
            ) : (
              <Ionicons name="create-outline" size={18} color="#1267e8" />
            )}
            <Text allowFontScaling={false} style={styles.updateButtonText}>
              Update Stage / Sub-stage
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => !saving && setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => !saving && setVisible(false)}
          />

          <SafeAreaView style={styles.sheet} edges={["bottom"]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text allowFontScaling={false} style={styles.sheetTitle}>
                  Update Workflow Stage
                </Text>
                <Text allowFontScaling={false} style={styles.sheetSubtitle}>
                  Every saved change is recorded with username and timestamp.
                </Text>
              </View>

              <Pressable
                disabled={saving}
                style={styles.closeButton}
                onPress={() => setVisible(false)}
              >
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <DropdownField
                label="Stage"
                value={draftStage}
                open={openDropdown === "stage"}
                onToggle={() =>
                  setOpenDropdown(openDropdown === "stage" ? null : "stage")
                }
              >
                {INCIDENT_STAGES.map((item) => (
                  <DropdownOption
                    key={item}
                    label={item}
                    selected={draftStage === item}
                    onPress={() => chooseStage(item)}
                  />
                ))}
              </DropdownField>

              <DropdownField
                label="Sub-stage"
                value={draftSubStage}
                open={openDropdown === "subStage"}
                onToggle={() =>
                  setOpenDropdown(
                    openDropdown === "subStage" ? null : "subStage",
                  )
                }
              >
                {subStageOptions.map((item) => (
                  <DropdownOption
                    key={item}
                    label={item}
                    selected={draftSubStage === item}
                    onPress={() => chooseSubStage(item)}
                  />
                ))}
              </DropdownField>

              {draftStage === "Threat" ? (
                <View style={styles.fieldWrap}>
                  <Text allowFontScaling={false} style={styles.fieldLabel}>
                    Threat Details
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    value={draftThreatDetails}
                    onChangeText={setDraftThreatDetails}
                    placeholder="Enter threat details / remarks"
                    placeholderTextColor="#94a3b8"
                    multiline
                    maxLength={2000}
                    textAlignVertical="top"
                    style={styles.stageTextInput}
                  />
                  <Text allowFontScaling={false} style={styles.characterCount}>
                    {draftThreatDetails.length}/2000
                  </Text>
                </View>
              ) : (
                <View style={styles.fieldWrap}>
                  <Text allowFontScaling={false} style={styles.fieldLabel}>
                    Action Plan Details
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    value={draftActionPlanDetails}
                    onChangeText={setDraftActionPlanDetails}
                    placeholder="Enter action plan details / remarks"
                    placeholderTextColor="#94a3b8"
                    multiline
                    maxLength={2000}
                    textAlignVertical="top"
                    style={styles.stageTextInput}
                  />
                  <Text allowFontScaling={false} style={styles.characterCount}>
                    {draftActionPlanDetails.length}/2000
                  </Text>
                </View>
              )}

              {draftStage === "Action Plan" &&
              draftSubStage === "Formulation" ? (
                <DropdownField
                  label="Action Plan"
                  value={draftActionPlan ?? "Select Action Plan"}
                  open={openDropdown === "actionPlan"}
                  placeholder={!draftActionPlan}
                  onToggle={() =>
                    setOpenDropdown(
                      openDropdown === "actionPlan" ? null : "actionPlan",
                    )
                  }
                >
                  {ACTION_PLAN_FORMULATION_OPTIONS.map((item) => (
                    <DropdownOption
                      key={item}
                      label={item}
                      selected={draftActionPlan === item}
                      onPress={() => {
                        setDraftActionPlan(item);
                        setOpenDropdown(null);
                        setValidationMessage(null);
                      }}
                    />
                  ))}
                </DropdownField>
              ) : null}

              {draftStage === "Action Plan" &&
              draftSubStage === "Implementation" ? (
                <View style={styles.implementationBox}>
                  <View style={styles.implementationHeader}>
                    <Ionicons
                      name="clipboard-outline"
                      size={18}
                      color="#1267e8"
                    />
                    <Text
                      allowFontScaling={false}
                      style={styles.implementationTitle}
                    >
                      Formulated Action Plan
                    </Text>
                  </View>
                  <Text
                    allowFontScaling={false}
                    style={
                      draftActionPlan
                        ? styles.implementationValue
                        : styles.implementationMissing
                    }
                  >
                    {draftActionPlan ??
                      "No Action Plan selected. Move to Formulation first and choose one."}
                  </Text>
                </View>
              ) : null}

              {validationMessage ? (
                <View style={styles.validationBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color="#b45309"
                  />
                  <Text
                    allowFontScaling={false}
                    style={styles.validationText}
                  >
                    {validationMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  saving && styles.disabledButton,
                  pressed && !saving && styles.pressed,
                ]}
                onPress={save}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="save-outline" size={20} color="#ffffff" />
                )}
                <Text allowFontScaling={false} style={styles.saveButtonText}>
                  {saving ? "Saving..." : "Save Stage Update"}
                </Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function DropdownField({
  label,
  value,
  open,
  placeholder = false,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  placeholder?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text allowFontScaling={false} style={styles.fieldLabel}>
        {label}
      </Text>
      <Pressable style={styles.dropdownButton} onPress={onToggle}>
        <Text
          allowFontScaling={false}
          numberOfLines={2}
          style={[styles.dropdownValue, placeholder && styles.placeholderText]}
        >
          {value}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={19}
          color="#64748b"
        />
      </Pressable>
      {open ? <View style={styles.dropdownMenu}>{children}</View> : null}
    </View>
  );
}

function DropdownOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.dropdownOption,
        selected && styles.dropdownOptionSelected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.dropdownOptionText,
          selected && styles.dropdownOptionTextSelected,
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" size={19} color="#1267e8" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    backgroundColor: "#f8fbff",
    padding: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#eaf2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: { flex: 1 },
  title: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  subtitle: {
    color: "#64748b",
    fontSize: 11.5,
    fontWeight: "700",
    marginTop: 2,
  },
  summaryGrid: {
    marginTop: 13,
    flexDirection: "row",
    gap: 9,
  },
  summaryBox: {
    flex: 1,
    minHeight: 65,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 11,
  },
  label: {
    color: "#64748b",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  value: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5,
  },
  actionPlanBox: {
    marginTop: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    padding: 11,
  },
  actionPlanValue: {
    marginTop: 5,
    color: "#78350f",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  stageTextGrid: {
    marginTop: 9,
    gap: 9,
  },
  stageTextBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 11,
  },
  stageTextValue: {
    marginTop: 5,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  updateButton: {
    height: 44,
    marginTop: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  updateButtonText: { color: "#1267e8", fontSize: 13, fontWeight: "900" },
  disabledButton: { opacity: 0.6 },
  pressed: { opacity: 0.78 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  sheetSubtitle: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16,
    maxWidth: 300,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContent: { padding: 18, paddingBottom: 28 },
  fieldWrap: { marginBottom: 15 },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 7,
  },
  dropdownButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dropdownValue: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "800",
    lineHeight: 18,
  },
  placeholderText: { color: "#94a3b8" },
  stageTextInput: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "700",
    lineHeight: 19,
  },
  characterCount: {
    marginTop: 5,
    color: "#94a3b8",
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "right",
  },
  dropdownMenu: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  dropdownOption: {
    minHeight: 45,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  dropdownOptionSelected: { backgroundColor: "#eff6ff" },
  dropdownOptionText: {
    flex: 1,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "800",
  },
  dropdownOptionTextSelected: { color: "#1267e8" },
  implementationBox: {
    marginBottom: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    backgroundColor: "#f8fafc",
    padding: 12,
  },
  implementationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  implementationTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  implementationValue: {
    marginTop: 8,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  implementationMissing: {
    marginTop: 8,
    color: "#b45309",
    fontSize: 12.5,
    fontWeight: "800",
    lineHeight: 18,
  },
  validationBox: {
    marginBottom: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    padding: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  validationText: {
    flex: 1,
    color: "#92400e",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  saveButton: {
    height: 52,
    borderRadius: 15,
    backgroundColor: "#1267e8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
});
