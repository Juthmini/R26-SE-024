import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { getStoredUser } from "../../../../api/authApi";
import HeroScene, { dayPart } from "../../memory/findThings/HeroScene";
import {
  GamesArt, RememberArt, RoutineArt, ScreeningArt, StoryArt, VaultArt,
} from "../../memory/findThings/Illustrations";

type Activity = {
  title: string;
  subtitle: string;
  Art: React.ComponentType<{ size?: number }>;
  tile: string;
  route?: string;
};

// Same activities and routes as before - only the presentation changed.
const ACTIVITIES: Activity[] = [
  { title: "My Daily Routine", subtitle: "Your routine guide", Art: RoutineArt, tile: "#EFF6FF" },
  { title: "Memory Vault", subtitle: "Photos & Stories", Art: VaultArt, tile: "#EEF2FF", route: "/patient/memory" },
  { title: "මගේ දේවල් · Find My Things", subtitle: "Remember, find & navigate", Art: RememberArt, tile: "#EFF6FF", route: "/patient/find-my-things" },
  { title: "මතක කතාව · Memory Story", subtitle: "Your day, as a story", Art: StoryArt, tile: "#FDF2F8", route: "/patient/memory-story" },
  { title: "Brain Games", subtitle: "Games for cognitive health", Art: GamesArt, tile: "#FFF7ED", route: "/patient/games" },
  { title: "Screening Test", subtitle: "Attempt Screening Test", Art: ScreeningArt, tile: "#FDF2F8", route: "/patient/cognitive/assessment" },
];

const GREETING = { morning: "Good morning", day: "Good afternoon", evening: "Good evening", night: "Good night" };
const GREETING_SI = { morning: "සුභ උදෑසනක්", day: "සුභ දහවලක්", evening: "සුභ සන්ධ්‍යාවක්", night: "සුභ රාත්‍රියක්" };

export default function ActivitySelectorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [name, setName] = useState("");
  const part = dayPart();
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    getStoredUser().then((u) => setName((u?.fullName || "").split(" ")[0] || "")).catch(() => {});
  }, []);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
      <View style={{ height: 250 }}>
        <HeroScene width={width} height={250} part={part} bg={BG} />
        <View style={s.heroText}>
          <Text style={s.welcome}>Welcome Back{name ? `, ${name}` : ""}</Text>
          <Text style={s.si}>{GREETING_SI[part]} · {GREETING[part]}</Text>
          <View style={s.dateChip}>
            <Text style={s.dateText}>📅 {currentDate}</Text>
          </View>
        </View>
      </View>

      <View style={s.body}>
        <Text style={s.section}>Activities</Text>
        <View style={s.grid}>
          {ACTIVITIES.map(({ title, subtitle, Art, tile, route }) => (
            <TouchableOpacity
              key={title}
              style={s.card}
              activeOpacity={0.85}
              onPress={route ? () => router.push(route as any) : undefined}
            >
              <View style={[s.tile, { backgroundColor: tile }]}>
                <Art size={92} />
              </View>
              <Text style={s.title} numberOfLines={2}>{title}</Text>
              <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const BG = "#F4F7F5";
const INK = "#0F2A24";

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  heroText: { position: "absolute", left: 22, right: 22, top: 26 },
  welcome: { color: "#fff", fontSize: 32, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6 },
  si: { color: "#fff", fontSize: 17, fontWeight: "700", marginTop: 4, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6 },
  dateChip: { alignSelf: "flex-start", marginTop: 12, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  dateText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  body: { paddingHorizontal: 20, marginTop: 4 },
  section: { fontSize: 22, fontWeight: "900", color: INK, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  card: { width: "48%", backgroundColor: "#fff", borderRadius: 28, paddingVertical: 18, paddingHorizontal: 10,
    alignItems: "center", borderWidth: 1, borderColor: "#E3EAE7",
    shadowColor: INK, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  tile: { width: 112, height: 112, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  title: { color: INK, fontSize: 16.5, fontWeight: "800", textAlign: "center", marginTop: 12, lineHeight: 22 },
  subtitle: { color: "#64748B", fontSize: 12.5, fontWeight: "600", textAlign: "center", marginTop: 3 },
});
