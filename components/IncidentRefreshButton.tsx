import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

type Props = {
  loading?: boolean;
  onPress: () => void;
};

export default function IncidentRefreshButton({ loading, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 50,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: loading ? "#94a3b8" : "#1267e8",
      }}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Ionicons name="refresh" size={21} color="#ffffff" />
      )}

      <Text style={{ color: "#ffffff", fontWeight: "900", fontSize: 15 }}>
        {loading ? "Fetching current GPS..." : "Clear Form & Fetch GPS"}
      </Text>
    </Pressable>
  );
}
