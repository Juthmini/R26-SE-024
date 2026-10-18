import * as ImagePicker from 'expo-image-picker';
import { authFetch } from '../../api/authApi';

// pick photo from device camera roll
export const pickPhoto = async () => {
  const permission =
    await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.7,
    base64: true,   // we need base64 to send to API
  });

  if (!result.canceled && result.assets[0]) {
    return result.assets[0];
  }
  return null;
};

// generate story from real photo — via your Node.js backend
export const generateStoryFromPhoto = async (data: {
  patientId:    string;
  image_base64: string;
  family_note:  string;
  category:     string;
}) => {
  try {
    return await authFetch('/family/memories', {
      method: 'POST',
      body: JSON.stringify({
        familyNote:  data.family_note,
        imageBase64: data.image_base64,
        category:    data.category,
      }),
    });
  } catch (error: any) {
    console.error('Story generation error:', error.message);
    return {
      success: false,
      error:   error.message,
    };
  }
};

export interface FamilyMemoryItem {
  _id: string;
  photoUrl: string;
  familyNote: string;
  category: string;
  generatedStory: string;
  playCount: number;
  createdAt: string;
}

// fetches every memory a family member has created for this patient —
// the real backing data for the "Your Stories" list
export const getMemoriesForPatient = async (patientId: string): Promise<FamilyMemoryItem[]> => {
  try {
    const data = await authFetch(`/family/memories/patient/${patientId}`);
    return data?.success ? data.memories : [];
  } catch (error: any) {
    console.error('Fetch memories error:', error.message);
    return [];
  }
};

export const deleteMemoryById = async (memoryId: string): Promise<boolean> => {
  try {
    const data = await authFetch(`/family/memories/${memoryId}`, { method: 'DELETE' });
    return !!data?.success;
  } catch (error: any) {
    console.error('Delete memory error:', error.message);
    return false;
  }
};

export interface CategoryRecommendation {
  category: string;
  avgMoodShiftPercent: number;
  sessionCount: number;
}

export interface CategoryRecommendationResponse {
  success: boolean;
  totalSessions: number;
  recommendation: CategoryRecommendation | null;
  ranked: CategoryRecommendation[];
}

// fetches which memory category tends to lift this patient's mood the
// most, based on real past listening sessions
export const getCategoryRecommendation = async (
  patientId: string
): Promise<CategoryRecommendationResponse> => {
  try {
    return await authFetch(`/family/memories/recommendation/${patientId}`);
  } catch (error: any) {
    console.error('Fetch category recommendation error:', error.message);
    return { success: false, totalSessions: 0, recommendation: null, ranked: [] };
  }
};