import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState, type ReactNode } from "react";
import {
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
  type ActionPlanOption,
  type IncidentStage,
  type IncidentSubStage,
} from "../lib/incidentWorkflow";

export type IncidentStageFormValue = {
  stage: IncidentStage;
  subStage: IncidentSubStage;
  actionPlan: ActionPlanOption | null;
  threatDetails: string;
  actionPlanDetails: string;
};

type DropdownKey = "stage" | "subStage" | "actionPlan" | null;

type Props = {
  value: IncidentStageFormValue;
  onChange: (next: IncidentStageFormValue) => void;
};

export const DEFAULT_INCIDENT_STAGE_FORM: IncidentStageFormValue = {
  stage: "Threat",
  subStage: "Reported",
  actionPlan: null,
  threatDetails: "",
  actionPlanDetails: "",
};

export function validateIncidentStageForm(value: IncidentStageFormValue) {
  const allowedSubStages = getSubStages(value.stage);

  if (!allowedSubStages.includes(value.subStage)) {
    return `Invalid Sub-stage for ${value.stage}.`;
  }

  if (
    value.stage === "Action Plan" &&
    (value.subStage === "Formulation" || value.subStage === "Implementation") &&
    !value.actionPlan
  ) {
    return value.subStage === "Formulation"
      ? "Please select an Action Plan for Formulation."
      : "An Action Plan must be formulated before moving to Implementation.";
  }

  if (value.threatDetails.length > 2000) {
    return "Threat Details cannot exceed 2000 characters.";
  }

  if (value.actionPlanDetails.length > 2000) {
    return "Action Plan Details cannot exceed 2000 characters.";
  }

  return null;
}

export default function IncidentStageFields({ value, onChange }: Props) {
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  const subStageOptions = useMemo(
    () => getSubStages(value.stage),
    [value.stage],
  );

  function setStage(stage: IncidentStage) {
    const nextSubStage = getSubStages(stage)[0];
    onChange({
      ...value,
      stage,
      subStage: nextSubStage,
      actionPlan: stage === "Threat" ? null : value.actionPlan,
    });
    setOpenDropdown(null);
  }

  function setSubStage(subStage: IncidentSubStage) {
    onChange({ ...value, subStage });
    setOpenDropdown(null);
  }

  function setActionPlan(actionPlan: ActionPlanOption) {
    onChange({ ...value, actionPlan });
    setOpenDropdown(null);
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Ionicons name="git-branch-outline" size={21} color="#1267e8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text allowFontScaling={false} style={styles.cardTitle}>
            Stage Workflow
          </Text>
          <Text allowFontScaling={false} style={styles.cardSubtitle}>
            Stage, Sub-stage and stage-specific details are saved with the incident.
          </Text>
        </View>
      </View>

      <DropdownField
        label="Stage"
        value={value.stage}
        open={openDropdown === "stage"}
        onToggle={() =>
          setOpenDropdown(openDropdown === "stage" ? null : "stage")
        }
      >
        {INCIDENT_STAGES.map((item) => (
          <DropdownOption
            key={item}
            label={item}
            selected={value.stage === item}
            onPress={() => setStage(item)}
          />
        ))}
      </DropdownField>

      <DropdownField
        label="Sub-stage"
        value={value.subStage}
        open={openDropdown === "subStage"}
        onToggle={() =>
          setOpenDropdown(openDropdown === "subStage" ? null : "subStage")
        }
      >
        {subStageOptions.map((item) => (
          <DropdownOption
            key={item}
            label={item}
            selected={value.subStage === item}
            onPress={() => setSubStage(item)}
          />
        ))}
      </DropdownField>

      {value.stage === "Threat" ? (
        <View style={styles.fieldWrap}>
          <Text allowFontScaling={false} style={styles.fieldLabel}>
            Threat Details
          </Text>
          <TextInput
            allowFontScaling={false}
            style={styles.textArea}
            value={value.threatDetails}
            onChangeText={(threatDetails) => onChange({ ...value, threatDetails })}
            placeholder="Enter threat details / assessment remarks"
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
          <Text allowFontScaling={false} style={styles.characterCount}>
            {value.threatDetails.length}/2000
          </Text>
        </View>
      ) : null}

      {value.stage === "Action Plan" && value.subStage === "Formulation" ? (
        <DropdownField
          label="Action Plan — Formulation"
          value={value.actionPlan ?? "Select Action Plan"}
          open={openDropdown === "actionPlan"}
          placeholder={!value.actionPlan}
          onToggle={() =>
            setOpenDropdown(openDropdown === "actionPlan" ? null : "actionPlan")
          }
        >
          {ACTION_PLAN_FORMULATION_OPTIONS.map((item) => (
            <DropdownOption
              key={item}
              label={item}
              selected={value.actionPlan === item}
              onPress={() => setActionPlan(item)}
            />
          ))}
        </DropdownField>
      ) : null}

      {value.stage === "Action Plan" && value.subStage === "Implementation" ? (
        <View style={styles.formulatedPlanBox}>
          <Text allowFontScaling={false} style={styles.fieldLabel}>
            Formulated Action Plan
          </Text>
          <Text
            allowFontScaling={false}
            style={value.actionPlan ? styles.planValue : styles.planMissing}
          >
            {value.actionPlan ??
              "No Action Plan selected. Choose Formulation first, select a plan, then move to Implementation."}
          </Text>
        </View>
      ) : null}

      {value.stage === "Action Plan" ? (
        <View style={styles.fieldWrap}>
          <Text allowFontScaling={false} style={styles.fieldLabel}>
            Action Plan Details
          </Text>
          <TextInput
            allowFontScaling={false}
            style={styles.textArea}
            value={value.actionPlanDetails}
            onChangeText={(actionPlanDetails) =>
              onChange({ ...value, actionPlanDetails })
            }
            placeholder="Enter action plan details / implementation remarks"
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
          <Text allowFontScaling={false} style={styles.characterCount}>
            {value.actionPlanDetails.length}/2000
          </Text>
        </View>
      ) : null}

      <View style={styles.savedFieldsHint}>
        <Ionicons name="information-circle-outline" size={17} color="#64748b" />
        <Text allowFontScaling={false} style={styles.savedFieldsHintText}>
          Threat Details and Action Plan Details are separate fields. Existing values are preserved when the Stage changes.
        </Text>
      </View>
    </View>
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

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={onToggle}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={onToggle} />
          <SafeAreaView style={styles.dropdownSheet} edges={["bottom"]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text allowFontScaling={false} style={styles.sheetTitle}>
                {label}
              </Text>
              <Pressable style={styles.closeButton} onPress={onToggle}>
                <Ionicons name="close" size={21} color="#475569" />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.optionsWrap}
            >
              {children}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
      style={[styles.optionRow, selected && styles.optionSelected]}
      onPress={onPress}
    >
      <Text
        allowFontScaling={false}
        style={[styles.optionText, selected && styles.optionTextSelected]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color="#1267e8" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 15,
    borderWidth: 1,
    borderColor: "#dbe7f5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  cardSubtitle: { color: "#64748b", fontSize: 11.5, fontWeight: "700", lineHeight: 17, marginTop: 2 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { color: "#334155", fontSize: 12.5, fontWeight: "900", marginBottom: 7 },
  dropdownButton: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#cbd9e8",
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dropdownValue: { flex: 1, color: "#0f172a", fontSize: 13.5, fontWeight: "800" },
  placeholderText: { color: "#94a3b8" },
  textArea: {
    minHeight: 104,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#cbd9e8",
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "700",
  },
  characterCount: { color: "#94a3b8", fontSize: 10.5, fontWeight: "800", textAlign: "right", marginTop: 5 },
  formulatedPlanBox: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 15,
    padding: 12,
    marginBottom: 12,
  },
  planValue: { color: "#1e3a8a", fontSize: 13, fontWeight: "900", lineHeight: 18 },
  planMissing: { color: "#b45309", fontSize: 12, fontWeight: "800", lineHeight: 18 },
  savedFieldsHint: {
    flexDirection: "row",
    gap: 7,
    alignItems: "flex-start",
    borderTopWidth: 1,
    borderTopColor: "#edf2f7",
    paddingTop: 10,
  },
  savedFieldsHintText: { flex: 1, color: "#64748b", fontSize: 10.5, fontWeight: "700", lineHeight: 15 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.42)" },
  dropdownSheet: {
    maxHeight: "72%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 99, backgroundColor: "#cbd5e1", alignSelf: "center", marginBottom: 10 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  closeButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  optionsWrap: { paddingBottom: 18, gap: 7 },
  optionRow: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  optionSelected: { borderColor: "#93c5fd", backgroundColor: "#eff6ff" },
  optionText: { flex: 1, color: "#334155", fontSize: 13.5, fontWeight: "800", lineHeight: 19 },
  optionTextSelected: { color: "#1267e8" },
});
