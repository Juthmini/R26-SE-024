import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

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
}) => {
  try {
    const response = await axios.post(
      `${API_URL}/family/memories`,
      {
        patientId:   data.patientId,
        familyNote:  data.family_note,
        imageBase64: data.image_base64,
      },
      { timeout: 90000 }
    );
    return response.data;
  } catch (error: any) {
    console.error('Story generation error:', error.message);
    return {
      success: false,
      error:   error.message,
    };
  }
};