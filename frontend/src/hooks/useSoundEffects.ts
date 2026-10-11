import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { getSoundEffectsEnabled } from "../utils/soundEffectsPreference";

type SoundType = "back" | "success" | "error" | "click";

const soundMap: Record<SoundType, any> = {
  back: require("@/assets/audio/back.wav"),
  success: require("@/assets/audio/success.wav"),
  error: require("@/assets/audio/error.wav"),
  click: require("@/assets/audio/click.wav"),
};

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
  const playersRef = useRef<Record<SoundType, AudioPlayer | null>>({
    back: null,
    success: null,
    error: null,
    click: null,
  });

  useEffect(() => {
    const players = playersRef.current;

    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {
      // audio mode not supported (e.g. web) - ignore
    });

    return () => {
      // Free the native players when the component using this hook unmounts
      Object.values(players).forEach((player) => player?.remove());
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
      // Create the player the first time this sound is needed
      if (!playersRef.current[type]) {
        playersRef.current[type] = createAudioPlayer(soundMap[type]);
      }

      const player = playersRef.current[type];
      if (!player) return;

      // Rewind to the start, then play (same as expo-av's replayAsync)
      await player.seekTo(0);
      player.play();
    } catch (error) {
      console.log("Sound playback error:", error);
    }
  }, []);

  return { playSound };
};