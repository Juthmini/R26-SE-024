import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type ActivityCardProps = {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackground: string;
  borderColor?: string;
  titleColor?: string;
  onPress?: () => void;
};

function ActivityCard({
  title,
  subtitle,
  icon,
  iconColor,
  iconBackground,
  borderColor,
  titleColor = "text-gray-800",
  onPress,
}: ActivityCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View
        className={`bg-white rounded-2xl p-4 shadow-sm flex-row items-center gap-4 ${borderColor ?? ""}`}
      >
        <View
          className={`w-14 h-14 rounded-xl items-center justify-center ${iconBackground}`}
        >
          <Ionicons name={icon} size={28} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className={`text-2xl font-bold ${titleColor}`}>{title}</Text>
          {subtitle ? (
            <Text className="text-lg text-gray-600">{subtitle}</Text>
          ) : null}
        </View>
        <Ionicons
          name="chevron-forward"
          size={24}
          color={borderColor ? "#fca5a5" : "#cbd5e1"}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function ActivitySelectorScreen() {
  const router = useRouter();
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <ScrollView
      className="flex-1 bg-blue-50"
      contentContainerStyle={{ paddingBottom: 96 }}
    >
      <View className="bg-gradient-to-b from-blue-600 to-blue-400 px-6 py-8 rounded-b-3xl">
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="sunny" size={40} color="#fbbf24" />
          <Text className="text-5xl font-bold text-black">Welcome Back</Text>
        </View>
        <Text className="text-2xl text-black">{currentDate}</Text>
      </View>

      <View className="px-6 py-6 gap-4">
        <ActivityCard
          title="මතක කතාව · Memory Vault"
          subtitle="Your day, as a story"
          icon="book"
          iconColor="#db2777"
          iconBackground="bg-pink-100"
          onPress={() => router.push("/patient/memory-story" as any)}
        />

        <ActivityCard
          title="මගේ දේවල් · Find My Things"
          subtitle="Remember, find & navigate"
          icon="search"
          iconColor="#3b82f6"
          iconBackground="bg-blue-100"
          onPress={() => router.push("/patient/find-my-things")}
        />

        <ActivityCard
          title="Brain Games"
          subtitle="Games for cognitive health"
          icon="game-controller"
          iconColor="#3b82f6"
          iconBackground="bg-blue-100"
          onPress={() => router.push("/patient/games")}
        />

        <ActivityCard
          title="Screening Test"
          subtitle="Attempt Screening Test"
          icon="medkit-outline"
          iconColor="#3b82f6"
          iconBackground="bg-blue-100"
          onPress={() => router.push("/patient/cognitive/assessment")}
        />

        {/* <View className="mt-10">
          <ActivityCard
            title="Call for Help"
            icon="call"
            iconColor="white"
            iconBackground="bg-red-500"
            borderColor="border-2 border-red-200"
            titleColor="text-red-600"
          />
        </View> */}
      </View>
    </ScrollView>
  );
}
