import { getMe } from "@/src/api/authApi";
import { useAssessmentSession } from "@/src/hooks/useAssessmentSession";
import {
  CARD_SHADOW,
  SECTION_THEME,
} from "@/src/components/patient/cognitive/components/screening-test/assessmentUi";
import {
  Bubbles,
  Gradient,
  GlowIcon,
  GRADIENTS,
  GradientButton,
  GradientView,
  IoniconName,
} from "@/src/components/patient/cognitive/components/screening-test/visuals";
import { SectionName } from "@/src/types/assessment.types";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function AssessmentWelcome() {
  const router = useRouter();
  const { startSession } = useAssessmentSession();
  const [isStarting, setIsStarting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleStart = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const meRes = await getMe();
      if (!meRes?.success) {
        throw new Error(meRes?.message || "Failed to load user");
      }

      const me = meRes.data.user;

      const patientId = me.role === "patient" ? me.id : undefined;
      const caregiverId =
        me.role === "caregiver" ? me.id : me.assignedCaregiverId;

      if (!patientId || !caregiverId) {
        throw new Error("Missing patient/caregiver ID");
      }

      await startSession({
        patientId,
        caregiverId,
        administrationMode: "self",
      });
      router.replace("/patient/cognitive/assessment/0");
    } catch (error) {
      console.error("Session start failed:", error);
      alert("Failed to start assessment. Please check your connection.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Gradient hero ─────────────────────────────── */}
        <GradientView
          colors={HERO_GRADIENT}
          className="items-center px-6 pb-16"
          style={{ paddingTop: insets.top + 32 }}
        >
          <Bubbles />
          <View className="w-32 h-32 rounded-full bg-white/15 border border-white/25 items-center justify-center mb-6">
            <GlowIcon colors={["#f0abfc", "#8b5cf6"]} mci="brain" size={84} glow={false} />
          </View>
          <Text className="text-3xl font-extrabold text-white text-center mb-3">
            Let&apos;s Begin a Quick Check
          </Text>
          <Text className="text-lg text-white/85 text-center leading-relaxed">
            A few simple questions to understand how we can best support you.
          </Text>
        </GradientView>

        {/* ── Content sheet ─────────────────────────────── */}
        <View className="flex-1 -mt-8 rounded-t-[32px] bg-slate-50 px-6 pt-6 pb-8">
          <View className="bg-white rounded-3xl p-4 gap-1 mb-5" style={CARD_SHADOW}>
            {INFO_ROWS.map((row) => (
              <View key={row.title} className="flex-row items-center gap-2">
                <GlowIcon colors={row.colors} icon={row.icon} size={46} />
                <View className="flex-1">
                  <Text className="text-base font-bold text-gray-900">
                    {row.title}
                  </Text>
                  <Text className="text-sm text-gray-500">{row.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text className="text-base font-bold text-gray-900 mb-3">
            What we&apos;ll check
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-8">
            {SECTIONS.map((section) => {
              const theme = SECTION_THEME[section];
              return (
                <View
                  key={section}
                  className={`flex-row items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 ${theme.chipBg}`}
                >
                  <GlowIcon colors={theme.gradient} icon={theme.solidIcon} size={26} glow={false} />
                  <Text className={`text-sm font-semibold ${theme.chipText}`}>
                    {section}
                  </Text>
                </View>
              );
            })}
          </View>

          <View className="mt-auto">
            <GradientButton
              label={isStarting ? "Starting…" : "Start Test"}
              colors={GRADIENTS.primary}
              icon="play"
              disabled={isStarting}
              loading={isStarting && <ActivityIndicator color="white" />}
              onPress={handleStart}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const HERO_GRADIENT: Gradient = ["#6366f1", "#3b82f6", "#06b6d4"];

const SECTIONS: SectionName[] = [
  "Orientation",
  "Registration",
  "Attention",
  "Recall",
  "Language",
];

const INFO_ROWS: {
  icon: IoniconName;
  colors: Gradient;
  title: string;
  body: string;
}[] = [
  { icon: "time", colors: GRADIENTS.sky, title: "Takes a few minutes", body: "Some questions have a short timer." },
  { icon: "people", colors: GRADIENTS.pink, title: "Have a caregiver nearby", body: "They will help check some answers." },
  { icon: "volume-high", colors: GRADIENTS.amber, title: "Find a quiet place", body: "One question plays a short audio clip." },
];
