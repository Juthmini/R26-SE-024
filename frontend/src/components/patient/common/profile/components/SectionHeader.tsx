import { Colors } from "@/src/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

interface SectionHeaderProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  // Icon tile colors - defaults to the primary blue.
  tint?: string;
  tintSoft?: string;
  // Rendered on the right, e.g. a count badge.
  right?: React.ReactNode;
}

export function SectionHeader({
  title,
  icon,
  subtitle,
  tint = Colors.primaryDark,
  tintSoft = Colors.primaryLight,
  right,
}: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: tintSoft }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// The white, softly-lifted card every Overview section sits on.
export const profileCard: ViewStyle = {
  backgroundColor: Colors.white,
  borderRadius: 24,
  marginBottom: 18,
  padding: 20,
  shadowColor: "#1E3A8A",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 3,
};

const styles = StyleSheet.create({
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 16,
  },
  sectionIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    marginRight: 12,
    width: 42,
  },
  titleBlock: {
    flex: 1,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
});
