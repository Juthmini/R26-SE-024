import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { getSoundEffectsEnabled } from "../utils/soundEffectsPreference";

type SoundType = "back" | "success" | "error" | "click";

async function fireHaptic(type: SoundType) {
  try {
    switch (type) {
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "click":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "back":
        await Haptics.selectionAsync();
        break;
    }
  } catch {
    // haptics unavailable (e.g. web) - ignore
  }
}

export const useSoundEffects = () => {
  const soundsRef = useRef<Record<SoundType, AudioPlayer | null>>({
    back: null,
    success: null,
    error: null,
    click: null,
  });

  useEffect(() => {
    const sounds = soundsRef.current;

    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });

    return () => {
      Object.values(sounds).forEach((sound) => sound?.remove());
    };
  }, []);

  // Stable identity so callers can safely list `playSound` in effect/callback
  // deps without causing re-render loops (it only ever touches refs).
  const playSound = useCallback(async (type: SoundType) => {
    if (!(await getSoundEffectsEnabled())) {
      return;
    }

    void fireHaptic(type);

    try {
      if (!soundsRef.current[type]) {
        const soundMap: Record<SoundType, any> = {
          back: require("@/assets/audio/back.wav"),
          success: require("@/assets/audio/success.wav"),
          error: require("@/assets/audio/error.wav"),
          click: require("@/assets/audio/click.wav"),
        };

        soundsRef.current[type] = createAudioPlayer(soundMap[type]);
      }

      const player = soundsRef.current[type];
      await player?.seekTo(0);
      player?.play();
    } catch (error) {
      console.log("Sound playback error:", error);
    }
  }, []);

  return { playSound };
};
