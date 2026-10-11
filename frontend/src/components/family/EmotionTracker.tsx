import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  logEmotionReading,
  finalizeEmotionSession,
  generateSessionId,
} from '../../services/family/emotionService';

interface EmotionTrackerProps {
  patientId: string;
  memoryId: string;
  isActive: boolean;
  onSessionEnd?: (outcome: any) => void;
}

const CAPTURE_INTERVAL_MS = 8000;

export default function EmotionTracker({
  patientId,
  memoryId,
  isActive,
  onSessionEnd,
}: EmotionTrackerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingRef = useRef(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    if (isActive && permission?.granted) {
      startSession();
    } else if (!isActive && sessionIdRef.current) {
      endSession();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, permission?.granted]);

  const startSession = () => {
    sessionIdRef.current = generateSessionId();
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      captureFrame();
    }, CAPTURE_INTERVAL_MS);

    // give the <video> element a moment to actually start streaming frames
    // before the first capture — calling takePictureAsync immediately on
    // mount throws "not enough camera data" on web
    setTimeout(captureFrame, 1500);
  };

  const captureFrame = async () => {
    if (!cameraRef.current || !sessionIdRef.current) return;
    // skip this tick if the previous capture is still in flight (e.g. the
    // emotion service is cold-starting) — firing overlapping requests every
    // 8s only piles more load onto a service that's already struggling
    if (isCapturingRef.current) return;

    isCapturingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.3,
      });

      if (!photo?.base64) return;

      const secondsIntoPlayback = Math.floor(
        (Date.now() - startTimeRef.current) / 1000
      );

      await logEmotionReading({
        patientId,
        memoryId,
        sessionId: sessionIdRef.current,
        secondsIntoPlayback,
        photoBase64: photo.base64,
      });
    } catch (error) {
      console.error('Frame capture failed:', error);
    } finally {
      isCapturingRef.current = false;
    }
  };

  const endSession = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (sessionIdRef.current) {
      const result = await finalizeEmotionSession(sessionIdRef.current);
      if (result.success && onSessionEnd) {
        onSessionEnd(result.outcome);
      }
      sessionIdRef.current = null;
    }
  };

  // only mount the CameraView while this tracker is actually active — if a
  // screen renders one EmotionTracker per list item (e.g. one per memory
  // card), an always-mounted CameraView per item would have every instance
  // fighting over the single physical camera, causing native capture
  // failures. Only the active one should ever hold the camera.
  if (!permission?.granted || !isActive) {
    return null;
  }

  return (
    <View style={styles.hiddenCamera}>
      <CameraView ref={cameraRef} facing="front" zoom={0} style={styles.camera} />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenCamera: {
    // small, unobtrusive indicator top-right — the underlying <video>/canvas
    // still needs a real (non-1px) render size for snapshots to work, so it
    // can't collapse to fully invisible; kept small instead
    position: 'absolute',
    top: 50,
    right: 12,
    width: 56,
    height: 56,
    opacity: 0.9,
    zIndex: 999,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
  },
  camera: {
    // fills the small indicator box exactly — previously this was fixed at
    // 320x240 inside a 56x56 clipped container, which showed only the
    // top-left corner of the feed (looked like an extreme, cropped zoom on
    // the face instead of the full frame)
    width: '100%',
    height: '100%',
  },
});