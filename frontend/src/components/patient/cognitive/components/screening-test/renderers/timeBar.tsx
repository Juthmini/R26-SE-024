import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

interface Props {
  secondsLeft: number;
  isWarning: boolean;
  timeLimit: number;
}

const formatTime = (s: number) => {
  const safe = Math.max(0, s);
  const m = Math.floor(safe / 60);
  const sec = safe % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
};

export function TimerBar({ secondsLeft, isWarning, timeLimit }: Props) {
  const safeTimeLimit = Math.max(timeLimit, 1);
  const pct = Math.max(0, Math.min(100, (secondsLeft / safeTimeLimit) * 100));
  const expired = secondsLeft <= 0;

  return (
    <View className="px-6 pb-2">
      <View
        className={`flex-row items-center gap-3 rounded-2xl px-4 py-2.5 ${
          expired ? "bg-gray-100" : isWarning ? "bg-rose-50" : "bg-white"
        }`}
        accessibilityLabel={
          expired ? "Time is up" : `${secondsLeft} seconds remaining`
        }
        accessibilityLiveRegion={isWarning ? "polite" : "none"}
      >
        <Ionicons
          name={expired ? "alarm-outline" : "time-outline"}
          size={20}
          color={expired ? "#6b7280" : isWarning ? "#e11d48" : "#2563eb"}
        />
        <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <View
            className={`h-full rounded-full ${
              isWarning ? "bg-rose-500" : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </View>
        <Text
          className={`min-w-[44px] text-right text-base font-bold ${
            expired
              ? "text-gray-500"
              : isWarning
                ? "text-rose-600"
                : "text-gray-700"
          }`}
        >
          {expired ? "Time up" : formatTime(secondsLeft)}
        </Text>
      </View>
    </View>
  );
}
