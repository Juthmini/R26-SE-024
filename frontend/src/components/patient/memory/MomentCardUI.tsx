import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Alert, Text, TouchableOpacity, View } from 'react-native';
import { syncMomentCardReminders } from '../../../services/patient/momentCardNotifications';
import {
  getDueEvents,
  getEventSettings,
  submitEmojiReaction,
  submitSkip,
  submitVideoReaction,
  submitVoiceReaction,
} from '../../../services/patient/momentCardService';
import { EmojiReaction, FamilyEvent } from '../../../types/family.types';

const POLL_INTERVAL_MS = 60000;
const MAX_VOICE_SECONDS = 15;

const THEME_COLORS: Record<string, { bg: string; accent: string }> = {
  birthday: { bg: '#FDF4FF', accent: '#A855F7' },
  anniversary: { bg: '#FFF1F2', accent: '#E11D48' },
  festival: { bg: '#FFFBEB', accent: '#D97706' },
  religious: { bg: '#ECFDF5', accent: '#059669' },
  other: { bg: '#EFF6FF', accent: '#2563EB' },
  calm: { bg: '#F8FAFC', accent: '#64748B' },
};

const EMOJI_BUTTONS: { key: EmojiReaction; emoji: string; label: string }[] = [
  { key: 'happy', emoji: '😊', label: 'Happy' },
  { key: 'calm', emoji: '😌', label: 'Calm' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
];

export default function MomentCardUI() {
  const [dueEvents, setDueEvents] = useState<FamilyEvent[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const [allowVideo, setAllowVideo] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  const [videoSeconds, setVideoSeconds] = useState(0);

  // computed up front (plain value, not a hook) so later hooks can close
  // over the current event's id without violating the rule that every hook
  // below must run unconditionally on every render
  const event = dueEvents[0];

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordStartRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const videoStartRef = useRef<number>(0);
  const videoTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    getDueEvents().then(setDueEvents);
  }, []);

  useEffect(() => {
    refresh();
    getEventSettings().then((s) => setAllowVideo(s.allowVideoReactions));
    syncMomentCardReminders();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [refresh]);

  const clearTimers = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    stopTimerRef.current = null;
    tickTimerRef.current = null;
  }, []);

  const stopRecording = useCallback(async (eventId: string) => {
    clearTimers();
    if (!recorder.isRecording) {
      setRecording(false);
      return;
    }
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    setRecording(false);

    const uri = recorder.uri;
    const durationSeconds = Math.min(
      Math.round((Date.now() - recordStartRef.current) / 1000),
      MAX_VOICE_SECONDS
    );

    if (!uri) return;

    setSending(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await submitVoiceReaction(eventId, base64, durationSeconds);
    } catch {
      Alert.alert('Could not send', 'Something went wrong sending your voice wish. Please try again.');
    } finally {
      setSending(false);
      setDueEvents((prev) => prev.filter((e) => e.id !== eventId));
    }
  }, [recorder, clearTimers]);

  // drives the actual video capture once videoMode flips on — a short delay
  // gives the CameraView time to mount before recordAsync is called (same
  // reasoning EmotionTracker.tsx uses before its first photo capture)
  useEffect(() => {
    if (!videoMode || !event) return;
    const eventId = event.id;
    let cancelled = false;

    videoStartRef.current = Date.now();
    setVideoSeconds(0);
    videoTickRef.current = setInterval(() => {
      setVideoSeconds((s) => Math.min(s + 1, MAX_VOICE_SECONDS));
    }, 1000);

    const timer = setTimeout(async () => {
      if (!cameraRef.current) return;
      try {
        const result = await cameraRef.current.recordAsync({ maxDuration: MAX_VOICE_SECONDS });
        if (cancelled) return;
        if (videoTickRef.current) { clearInterval(videoTickRef.current); videoTickRef.current = null; }
        setVideoMode(false);
        if (!result?.uri) return;

        const durationSeconds = Math.min(
          Math.round((Date.now() - videoStartRef.current) / 1000),
          MAX_VOICE_SECONDS
        );

        setSending(true);
        try {
          const base64 = await FileSystem.readAsStringAsync(result.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await submitVideoReaction(eventId, base64, durationSeconds);
        } catch {
          Alert.alert('Could not send', 'Something went wrong sending your video wish. Please try again.');
        } finally {
          setSending(false);
          setDueEvents((prev) => prev.filter((e) => e.id !== eventId));
        }
      } catch {
        if (!cancelled) setVideoMode(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (videoTickRef.current) clearInterval(videoTickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoMode, event?.id]);

  if (!event) return null;

  const theme = THEME_COLORS[event.theme] || THEME_COLORS.other;

  const dismiss = (eventId: string) => {
    setDueEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const handleEmoji = async (emoji: EmojiReaction) => {
    if (sending) return;
    setSending(true);
    await submitEmojiReaction(event.id, emoji);
    setSending(false);
    dismiss(event.id);
  };

  const handleLater = async () => {
    if (sending) return;
    setSending(true);
    await submitSkip(event.id);
    setSending(false);
    dismiss(event.id);
  };

  const startRecording = async () => {
    if (sending || recording) return;

    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setMicDenied(true);
      return;
    }

    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();

    recordStartRef.current = Date.now();
    setRecordSeconds(0);
    setRecording(true);

    tickTimerRef.current = setInterval(() => {
      setRecordSeconds((s) => Math.min(s + 1, MAX_VOICE_SECONDS));
    }, 1000);
    stopTimerRef.current = setTimeout(() => {
      stopRecording(event.id);
    }, MAX_VOICE_SECONDS * 1000);
  };

  const askToRecord = () => {
    if (micDenied) return;
    Alert.alert(
      'Use your microphone?',
      'MemoCare would like to record a short voice wish to send back.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Allow', onPress: startRecording },
      ]
    );
  };

  const startVideoRecording = async () => {
    if (sending || recording || videoMode) return;

    let camPerm = cameraPermission;
    if (!camPerm?.granted) {
      camPerm = await requestCameraPermission();
    }
    if (!camPerm?.granted) return;

    const micPerm = await requestRecordingPermissionsAsync();
    if (!micPerm.granted) return;

    setVideoMode(true);
  };

  const stopVideoRecording = () => {
    try {
      cameraRef.current?.stopRecording();
    } catch {
      // recordAsync's own promise resolves regardless once recording stops
    }
  };

  const askToRecordVideo = () => {
    Alert.alert(
      'Use your camera and microphone?',
      'MemoCare would like to record a short video wish to send back.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Allow', onPress: startVideoRecording },
      ]
    );
  };

  return (
    <View
      style={{
        backgroundColor: theme.bg,
        borderRadius: 28,
        padding: 20,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: theme.accent + '40',
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '900', color: theme.accent, marginBottom: 6 }}>
        {event.status === 'missed' ? 'You Missed This' : event.sensitive ? 'A Quiet Moment' : 'A Special Day'}
      </Text>
      <Text style={{ fontSize: 24, fontWeight: '900', color: '#1C1917', marginBottom: 10, lineHeight: 32 }}>
        {event.cardText}
      </Text>
      {event.status === 'missed' && (
        <Text style={{ fontSize: 14, color: '#57534E', marginBottom: 10, lineHeight: 20 }}>
          It's okay — want to send a quick note now?
        </Text>
      )}

      {videoMode ? (
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 18, overflow: 'hidden', marginBottom: 12 }}>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.accent, marginBottom: 10 }}>
            Recording… {videoSeconds}s / {MAX_VOICE_SECONDS}s
          </Text>
          <TouchableOpacity
            onPress={stopVideoRecording}
            style={{ backgroundColor: theme.accent, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 28 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : recording ? (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.accent, marginTop: 10 }}>
            Recording… {recordSeconds}s / {MAX_VOICE_SECONDS}s
          </Text>
          <TouchableOpacity
            onPress={() => stopRecording(event.id)}
            style={{ marginTop: 14, backgroundColor: theme.accent, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 28 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : sending ? (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <View>
          {!event.sensitive && !micDenied && (
            <TouchableOpacity
              onPress={askToRecord}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.accent, borderRadius: 18, paddingVertical: 18, marginBottom: 14 }}
            >
              <Ionicons name="mic" size={26} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                {event.eventType === 'birthday' ? 'Say Happy Birthday' : 'Send a Voice Wish'}
              </Text>
            </TouchableOpacity>
          )}

          {!event.sensitive && allowVideo && (
            <TouchableOpacity
              onPress={askToRecordVideo}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, marginBottom: 14, borderWidth: 2, borderColor: theme.accent }}
            >
              <Ionicons name="videocam" size={22} color={theme.accent} />
              <Text style={{ color: theme.accent, fontSize: 15, fontWeight: '800' }}>Send a video instead</Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            {EMOJI_BUTTONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => handleEmoji(opt.key)}
                style={{ flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14 }}
              >
                <Text style={{ fontSize: 34 }}>{opt.emoji}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#44403C', marginTop: 4 }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={handleLater} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#78716C' }}>Later</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
