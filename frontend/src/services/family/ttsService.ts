import * as Speech from 'expo-speech';

// cached lookup — querying available voices is async and only needs doing once
let bestVoicePromise: Promise<string | undefined> | null = null;

const pickBestVoice = async (): Promise<string | undefined> => {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const englishVoices = voices.filter((v) => v.language?.startsWith('en'));

    // prefer a higher-quality "Enhanced"/"Premium" voice if the device has
    // one installed — these sound noticeably more natural than the default
    // robotic system voice
    const enhanced = englishVoices.find(
      (v) => v.quality === Speech.VoiceQuality.Enhanced
    );
    return (enhanced || englishVoices[0])?.identifier;
  } catch {
    return undefined;
  }
};

// splits into sentences and speaks them one at a time with a short pause
// between each — a flat continuous read sounds instructional, brief pauses
// at sentence boundaries read as more deliberate/narrative
const splitIntoSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const PAUSE_BETWEEN_SENTENCES_MS = 450;

let cancelToken = { cancelled: false };

export const speakStory = async (text: string, onDone?: () => void) => {
  Speech.stop();
  cancelToken.cancelled = false;
  const myToken = cancelToken;

  if (!bestVoicePromise) bestVoicePromise = pickBestVoice();
  const voice = await bestVoicePromise;
  if (myToken.cancelled) return;

  const sentences = splitIntoSentences(text);
  let index = 0;

  const speakNext = () => {
    if (myToken.cancelled) return;
    if (index >= sentences.length) {
      onDone?.();
      return;
    }

    const sentence = sentences[index];
    index += 1;

    Speech.speak(sentence, {
      language: 'en-US',
      voice,
      pitch: 0.97,   // very slightly lower — warmer, less clinical
      rate: 0.82,    // slower, more deliberate storytelling pace
      onDone: () => {
        if (myToken.cancelled) return;
        setTimeout(speakNext, PAUSE_BETWEEN_SENTENCES_MS);
      },
      onStopped: () => onDone?.(),
      onError: () => onDone?.(),
    });
  };

  speakNext();
};

export const stopSpeaking = () => {
  cancelToken.cancelled = true;
  Speech.stop();
};
