import { Colors } from "@/src/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { profileCard, SectionHeader } from "../components/SectionHeader";

interface SettingsSectionProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function SettingsSection({ soundEnabled, onToggleSound }: SettingsSectionProps) {
  return (
    <View style={profileCard}>
      <SectionHeader
        title="Settings"
        subtitle="Personalise how the app feels"
        icon="settings-outline"
        tint="#475569"
        tintSoft="#F1F5F9"
      />
      <View style={styles.settingRow}>
        <View style={[styles.settingIcon, soundEnabled && styles.settingIconOn]}>
          <Ionicons
            name={soundEnabled ? "volume-high" : "volume-mute"}
            size={20}
            color={Colors.white}
          />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>Sound Effects</Text>
          <Text style={styles.settingDescription}>
            {soundEnabled ? "On" : "Off"} · game and button sounds
          </Text>
        </View>
        <Switch
          accessibilityLabel="Sound effects"
          accessibilityRole="switch"
          value={soundEnabled}
          onValueChange={onToggleSound}
          trackColor={{ false: "#CBD5E1", true: "#22C55E" }}
          thumbColor={Colors.white}
          ios_backgroundColor="#CBD5E1"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    flexDirection: "row",
    padding: 14,
  },
  settingIcon: {
    alignItems: "center",
    backgroundColor: "#94A3B8",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  settingIconOn: {
    backgroundColor: Colors.primaryDark,
  },
  settingText: {
    flex: 1,
    marginRight: 8,
  },
  settingTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  settingDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
});
