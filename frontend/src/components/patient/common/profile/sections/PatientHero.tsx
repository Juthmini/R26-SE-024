import { logoutUser } from "@/src/api/authApi";
import { LogoutConfirmModal } from "@/src/components/common/LogoutConfirmModal";
import { Colors } from "@/src/constants/colors";
import { UserProfile } from "@/src/hooks/usePatientProfile";
import { getInitials } from "@/src/utils/formatters";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface PatientHeroProps {
  user: UserProfile;
  // Total completed brain-game sessions, shown in the stats strip.
  gamesPlayed: number;
  // True when a caregiver is viewing another patient's profile - hides the
  // logout and edit buttons (that account isn't the caregiver's to act on).
  readOnly?: boolean;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// "Not set" / "Not available" come from usePatientProfile's fallback user.
function display(value?: string | number) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text || text.startsWith("Not ")) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function PatientHero({ user, gamesPlayed, readOnly = false }: PatientHeroProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogout = async () => {
    await logoutUser();
    setShowConfirm(false);
    router.replace("/auth/login");
  };

  const email = display(user.email);

  return (
    <View style={styles.hero}>
      {/* Decorative bubbles */}
      <View style={[styles.bubble, styles.bubbleLarge]} />
      <View style={[styles.bubble, styles.bubbleSmall]} />

      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>
          {readOnly ? "Patient Profile" : `${greeting()} 👋`}
        </Text>
        {!readOnly && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.editPill}
              onPress={() => router.push("/patient/profile-edit")}
              activeOpacity={0.85}
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="create-outline" size={14} color={Colors.primaryDark} />
              <Text style={styles.editPillText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowConfirm(true)}
              activeOpacity={0.85}
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.identity}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user.fullName)}</Text>
          </View>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={2}>
            {user.fullName || "Patient"}
          </Text>
          {!readOnly && email !== "—" && (
            <View style={styles.emailRow}>
              <Ionicons name="mail-outline" size={13} color="#BFDBFE" />
              <Text style={styles.email} numberOfLines={1}>
                {email}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat icon="calendar-outline" label="Age" value={display(user.age)} />
        <View style={styles.statDivider} />
        <Stat icon="male-female-outline" label="Gender" value={display(user.gender)} />
        <View style={styles.statDivider} />
        <Stat icon="game-controller-outline" label="Games" value={String(gamesPlayed)} />
      </View>

      <LogoutConfirmModal
        visible={showConfirm}
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleLogout}
      />
    </View>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color="#BFDBFE" />
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: "#1D4ED8",
    borderRadius: 28,
    marginBottom: 18,
    overflow: "hidden",
    padding: 22,
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  bubble: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    position: "absolute",
  },
  bubbleLarge: {
    height: 220,
    right: -70,
    top: -90,
    width: 220,
  },
  bubbleSmall: {
    backgroundColor: "rgba(96, 165, 250, 0.25)",
    bottom: -50,
    height: 130,
    left: -40,
    width: 130,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  eyebrow: {
    color: "#DBEAFE",
    fontSize: 14,
    fontWeight: "700",
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  editPill: {
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editPillText: {
    color: Colors.primaryDark,
    fontSize: 13,
    fontWeight: "800",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 18,
  },
  avatarRing: {
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 30,
    borderWidth: 2,
    padding: 4,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 24,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  avatarText: {
    color: "#1D4ED8",
    fontSize: 28,
    fontWeight: "900",
  },
  identityText: {
    flex: 1,
    marginLeft: 16,
  },
  name: {
    color: Colors.white,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  emailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  email: {
    color: "#DBEAFE",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  stats: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    paddingVertical: 14,
  },
  stat: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 6,
  },
  statValue: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  statLabel: {
    color: "#BFDBFE",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: "uppercase",
  },
  statDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    height: 34,
    width: 1,
  },
});
