import { authFetch } from '../../api/authApi';

// Patient-side equivalent of src/services/family/emotionService.ts's
// logEmotionReading/finalizeEmotionSession — same request shape, just hits
// the patient-authorized routes so EmotionTracker works when it's mounted
// from the real patient screen (MemoryScreen.tsx), not just the family-token
// demo screen.

export const warmupEmotionService = () => {
  authFetch('/patient/emotion/warmup').catch(() => {});
};

export const logEmotionReading = async (data: {
  patientId: string;
  memoryId: string;
  sessionId: string;
  secondsIntoPlayback: number;
  photoBase64: string;
}) => {
  try {
    return await authFetch('/patient/emotion/capture', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (error: any) {
    console.error('Emotion capture error:', error.message);
    return { success: false };
  }
};

export const finalizeEmotionSession = async (sessionId: string) => {
  try {
    return await authFetch('/patient/emotion/finalize', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  } catch (error: any) {
    console.error('Finalize session error:', error.message);
    return { success: false };
  }
};
