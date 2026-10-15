import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePatientProfile } from "../../../../hooks/usePatientProfile";
import { useSettings } from "../../../../hooks/useSettings";
import { PatientReportView } from "../../cognitive/components/report/PatientReportView";
import { GameReviewsSection } from "./sections/GameReviewsSection";
import { PatientHero } from "./sections/PatientHero";
import { SettingsSection } from "./sections/SettingsSection";
import { SeverityCheckSection } from "./sections/SeverityCheckSection";

type ProfileTab = "overview" | "reporting";

const TABS: { key: ProfileTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "overview", label: "Overview", icon: "person-outline" },
  { key: "reporting", label: "Reporting", icon: "bar-chart-outline" },
];
const TAB_BAR_PADDING = 4;

// Overview sections slide up one after another on first render.
const enter = (index: number) => FadeInDown.delay(index * 80).duration(380);

interface PatientProfileScreenProps {
  // When provided (a caregiver viewing a linked patient), loads that
  // patient's data instead of the logged-in user's own. Omit for the
  // patient's own self-view (frontend/app/patient/(tabs)/profile/index.tsx).
  patientId?: string;
  patientName?: string;
  // Hides controls that only make sense on the account's own device
  // (Logout, Update details, personal app Settings).
  isCaregiverView?: boolean;
}

export default function PatientProfileScreen({
  patientId,
  patientName,
  isCaregiverView = false,
}: PatientProfileScreenProps) {
  const { user, gameReviews, latestSession } = usePatientProfile(
    patientId,
    patientName ? { fullName: patientName } : undefined,
  );
  const { soundEnabled, toggleSound } = useSettings();
  const [tab, setTab] = useState<ProfileTab>("overview");
  const gamesPlayed = gameReviews.reduce((sum, review) => sum + review.sessions, 0);

  // Sliding white pill behind the active tab.
  const [tabWidth, setTabWidth] = useState(0);
  const pillX = useSharedValue(0);
  useEffect(() => {
    pillX.value = withTiming(tab === "overview" ? 0 : tabWidth, { duration: 220 });
  }, [tab, tabWidth, pillX]);
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));
  const onTabBarLayout = (e: LayoutChangeEvent) =>
    setTabWidth((e.nativeEvent.layout.width - TAB_BAR_PADDING * 2) / 2);

  let section = 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── Tab switcher ─────────────────────────────────────────── */}
      <View style={styles.tabBar} onLayout={onTabBarLayout}>
        {tabWidth > 0 && (
          <Animated.View style={[styles.tabPill, { width: tabWidth }, pillStyle]} />
        )}
        {TABS.map(({ key, label, icon }) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={styles.tabButton}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={icon} size={16} color={active ? "#1D4ED8" : "#64748B"} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "overview" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={enter(section++)}>
            <PatientHero user={user} gamesPlayed={gamesPlayed} readOnly={isCaregiverView} />
          </Animated.View>
          <Animated.View entering={enter(section++)}>
            <SeverityCheckSection
              patientId={user.id ?? ""}
              latestSession={latestSession}
              showTakeAssessmentCta={!isCaregiverView}
            />
          </Animated.View>
          <Animated.View entering={enter(section++)}>
            <GameReviewsSection reviews={gameReviews} />
          </Animated.View>
          {!isCaregiverView && (
            <Animated.View entering={enter(section++)}>
              <SettingsSection soundEnabled={soundEnabled} onToggleSound={toggleSound} />
            </Animated.View>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <PatientReportView patientId={patientId} patientName={patientName} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 112,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: "#E7ECF4",
    borderRadius: 16,
    padding: TAB_BAR_PADDING,
  },
  tabPill: {
    position: "absolute",
    top: TAB_BAR_PADDING,
    bottom: TAB_BAR_PADDING,
    left: TAB_BAR_PADDING,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  tabLabelActive: {
    color: "#1D4ED8",
    fontWeight: "800",
  },
});
