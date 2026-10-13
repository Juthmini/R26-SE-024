/**
 * Voice Command Logic â€” Object Finder with GPS + Navigation
 */
import * as Speech from 'expo-speech';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
const AI_URL = process.env.EXPO_PUBLIC_AI_URL || 'http://192.168.1.80:8000';

const OBJECT_KEYWORDS = [
  'toothbrush', 'brush', 'spectacles', 'glasses', 'specs', 'keys', 'key',
  'phone', 'mobile', 'wallet', 'purse', 'bag', 'medicine', 'tablets',
  'pills', 'remote', 'tv remote', 'cup', 'mug', 'book', 'pen', 'comb',
  'shoes', 'slippers', 'watch', 'charger', 'bottle', 'umbrella', 'stick',
  'cane', 'newspaper', 'towel', 'soap',
  'යතුරු', 'කණ්ණාඩි', 'බෙහෙත්', 'ෆෝන් එක', 'ෆෝන්', 'වොලට් එක', 'බෑග්', 'කෝප්පය', 
  'පොත', 'පෑන', 'සෙරෙප්පු', 'ඔරලෝසුව', 'බෝතලය', 'කුඩය'
];

const KEYWORD_MAP: Record<string, string> = {
  brush: 'toothbrush',
  glasses: 'spectacles',
  specs: 'spectacles',
  'my phone': 'phone',
  mobile: 'phone',
  tablets: 'medicine',
  pills: 'medicine',
  slippers: 'shoes',
  stick: 'cane',
  'tv remote': 'remote',
  'යතුරු': 'keys',
  'කණ්ණාඩි': 'glasses',
  'බෙහෙත්': 'medicine',
  'ෆෝන් එක': 'phone',
  'ෆෝන්': 'phone',
  'වොලට් එක': 'wallet',
  'බෑග්': 'bag',
  'කෝප්පය': 'cup',
  'පොත': 'book',
  'පෑන': 'pen',
  'සෙරෙප්පු': 'shoes',
  'ඔරලෝසුව': 'watch',
  'බෝතලය': 'bottle',
  'කුඩය': 'umbrella',
  // Singlish fallbacks
  yathuru: 'keys',
  kannadi: 'glasses',
  beheth: 'medicine',
  wallet: 'wallet',
  bag: 'bag',
  koppaya: 'cup',
  koppa: 'cup',
  kota: 'cup', // Misrecognized 'koppa'
  potha: 'book',
  pena: 'pen',
  sereppu: 'shoes',
  orolosuwa: 'watch',
  bothalaya: 'bottle',
  kudaya: 'umbrella'
};

export function normaliseKeyword(word: string): string {
  const lc = word.toLowerCase().trim();
  return KEYWORD_MAP[lc] || lc;
}

export function extractObjectKeyword(text: string): string | null {
  const cleanText = text.toLowerCase().replace(/[?.,!]/g, '').trim();
  for (const kw of ['tv remote', 'ෆෝන් එක', 'වොලට් එක']) {
    if (cleanText.includes(kw)) return normaliseKeyword(kw);
  }
  for (const kw of OBJECT_KEYWORDS) {
    if (cleanText.includes(kw)) return normaliseKeyword(kw);
  }
  // Return the last word as a fallback instead of null
  return normaliseKeyword(cleanText.split(' ').pop() || cleanText);
}

export interface FindResult {
  found: boolean;
  message: string;
  distanceLabel?: string;
  roomLabel?: string;
  locationDetail?: string;
  timeLabel?: string;
  spokenMessage?: string;
  objLat?: number;
  objLng?: number;
  objectName?: string;
  imageUrl?: string;
}

/**
 * Find last known object location by checking AsyncStorage, Python Vault, and Node Backend.
 */
export async function findAndSpeakLocation(
  language: 'si-LK' | 'en-US',
  patientId: string,
  keyword: string,
  patientName: string = 'there',
  userLat?: number,
  userLng?: number,
): Promise<FindResult> {
  try {
    const isSi = language === 'si-LK';
    const voiceConfig = isSi ? { language, rate: 0.88 } : { language, rate: 0.9, pitch: 1.1, voice: 'com.apple.ttsbundle.Samantha-compact' };
    const searchWord = keyword.toLowerCase().replace(/[?.,!]/g, '').trim();
    
    let allMemories: any[] = [];

    // 1. Local AsyncStorage
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const memKey = `patient_memories_${patientId}`;
      const stored = await AsyncStorage.getItem(memKey);
      if (stored) allMemories = [...JSON.parse(stored)];
    } catch (e) {}

    // 2. Node Backend
    try {
      const res = await axios.get(`${BASE_URL}/api/admin/personal-objects/patient/${patientId}`);
      if (res.data.success) {
        res.data.data.forEach((obj: any) => {
          allMemories.push({
            name: obj.objectName,
            location: 'Near the Camera',
            time: 'Recently',
            image_url: `${BASE_URL}${obj.imageUrl}`
          });
        });
      }
    } catch (e) {}

    // 3. Python Backend Vault
    try {
      const pId = patientId || 'PAT-2026-003';
      const pyRes = await axios.get(`${AI_URL}/vault/${pId}`);
      if (pyRes.data.status === 'success' && pyRes.data.vault) {
        pyRes.data.vault.forEach((obj: any) => {
          allMemories.push({
            name: obj.object,
            original_object: obj.original_object,
            location: obj.location || 'Near the Camera',
            time: obj.time,
            image_url: obj.image_url,
            lat: obj.lat,
            lng: obj.lng
          });
        });
      }
    } catch (e) {}

    // Find the object
    const foundItem = allMemories.find((m: any) => 
      (m.name && m.name.toLowerCase().includes(searchWord)) || 
      (m.original_object && m.original_object.toLowerCase().includes(searchWord))
    );

    if (foundItem) {
      const roomLabel = foundItem.location || "Near the Camera";
      const timeLabel = foundItem.time || "Recently";
      const distanceLabel = "5m";
      const objLat = foundItem.lat || (userLat ? userLat + 0.0001 : 6.9271);
      const objLng = foundItem.lng || (userLng ? userLng + 0.0001 : 79.8612);

      const displayMsg = isSi ? `${foundItem.name} තියෙන්නේ ${roomLabel} එකේ (${timeLabel})` : `Your ${foundItem.name} is in the ${roomLabel} (${timeLabel})`;
      const spokenMessage = isSi ? `මම අන්තිමට ${foundItem.name} දැක්කේ ${roomLabel} එකේ, වෙලාව ${timeLabel}` : `I last saw your ${foundItem.name} in the ${roomLabel} at ${timeLabel}.`;

      Speech.speak(spokenMessage, voiceConfig);

      return {
        found: true,
        message: displayMsg,
        distanceLabel,
        roomLabel,
        locationDetail: "Found in Memory Vault",
        timeLabel,
        spokenMessage,
        objLat,
        objLng,
        objectName: foundItem.name,
        imageUrl: foundItem.image_url || foundItem.image,
      };
    }

    // Not found
    const msg = isSi ? `සමාවෙන්න, මම තාම ${keyword} එක දැක්කේ නෑ. කැමරාවෙන් ඒක බලන්න.` : `${patientName}, I have not seen your ${keyword} yet. Please show it to the camera first.`;
    Speech.speak(msg, voiceConfig);
    return { found: false, message: msg };

  } catch {
    const isSi = language === 'si-LK';
    const msg = isSi ? "සර්වර් එකට සම්බන්ද වෙන්න බෑ." : "Could not connect to the backend.";
    const voiceConfig = isSi ? { language, rate: 0.88 } : { language, rate: 0.9, pitch: 1.1, voice: 'com.apple.ttsbundle.Samantha-compact' };
    Speech.speak(msg, voiceConfig);
    return { found: false, message: msg };
  }
}
