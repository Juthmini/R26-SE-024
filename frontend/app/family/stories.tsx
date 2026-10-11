import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../src/constants/colors';
import { getLinkedPatient, getMemoryStories } from '../../src/services/family/familyService';
import {
  generateStoryFromPhoto,
  pickPhoto,
} from '../../src/services/family/storyService';
import { speakStory, stopSpeaking } from '../../src/services/family/ttsService';

export default function StoriesScreen() {
  const router = useRouter();
  const stories = getMemoryStories();
  const patient = getLinkedPatient();   // gives us patient.id = 'p-001'

  const [playing, setPlaying] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // upload state
  const [photo, setPhoto] = useState<any>(null);
  const [familyNote, setFamilyNote] = useState('');

  // result state
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [generatedStory, setGeneratedStory] = useState('');
  const [voicePlaying, setVoicePlaying] = useState(false);

  const handlePickPhoto = async () => {
    const asset = await pickPhoto();
    if (asset) {
      setPhoto(asset);
      setGeneratedStory('');
    }
  };

  const handleGenerate = async () => {
    if (!photo) {
      Alert.alert('Missing', 'Please select a photo first');
      return;
    }
    if (!familyNote.trim()) {
      Alert.alert('Missing', 'Please write a memory note');
      return;
    }

    setLoading(true);
    setGeneratedStory('');
    stopSpeaking();
    setVoicePlaying(false);

    try {
      setStatus('Creating story...');
      const result = await generateStoryFromPhoto({
        patientId:    patient.id,
        image_base64: photo.base64,
        family_note:  familyNote,
      });

      if (result.success) {
        setGeneratedStory(result.memory.generatedStory);
        setStatus('');
        setVoicePlaying(true);
        speakStory(result.memory.generatedStory, () => setVoicePlaying(false));
      } else {
        Alert.alert('Error', result.error || 'Could not generate story');
        setStatus('');
      }
    } catch (e: any) {
      Alert.alert('Connection Error', 'Make sure the backend server is running');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleVoicePlayStop = () => {
    if (voicePlaying) {
      stopSpeaking();
      setVoicePlaying(false);
    } else {
      setVoicePlaying(true);
      speakStory(generatedStory, () => setVoicePlaying(false));
    }
  };

  const resetModal = () => {
    setPhoto(null);
    setFamilyNote('');
    setGeneratedStory('');
    setStatus('');
    stopSpeaking();
    setVoicePlaying(false);
    setShowModal(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Header */}
        <View style={{ backgroundColor: Colors.white, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>Memory Stories</Text>
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 2 }}>AI-narrated stories in a familiar voice</Text>
        </View>

        {/* TEST LINK — jumps to the standalone patient-side listening demo
            (frontend/app/patient-view-test.tsx). Not part of the teammate's
            /patient module. Remove once patient-side testing is done. */}
        <TouchableOpacity
          onPress={() => router.push('/patient-view-test')}
          style={{ margin: 20, marginBottom: 0, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#BBF7D0' }}
        >
          <Ionicons name="person-circle-outline" size={22} color="#16a34a" />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#15803d' }}>
            Test: Patient Listening View
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#16a34a" />
        </TouchableOpacity>

        {/* Explainer card */}
        <View style={{ margin: 20, backgroundColor: Colors.purple + '15', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.purple + '30' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.purpleSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
              <Ionicons name="mic" size={22} color={Colors.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.purple, marginBottom: 4 }}>AI Voice Narration</Text>
              <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>Upload a photo and our system creates a personalised voice story narrated in a familiar family voice. Stories trigger mood improvements and enhance memory recall.</Text>
            </View>
          </View>
        </View>

        {/* Upload button — connects to modal */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowModal(true)}
          style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: Colors.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }}
        >
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Upload Photo & Create Story</Text>
        </TouchableOpacity>

        {/* Stories list */}
        <View style={{ marginHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>YOUR STORIES</Text>
          {stories.map((story) => (
            <View key={story.id} style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: Colors.borderLight }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: Colors.purpleSoft, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="images" size={26} color={Colors.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.textPrimary, flex: 1 }}>{story.title}</Text>
                    {story.status === 'new' && (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.primaryLight }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.primary }}>NEW</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 4 }}>{story.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                      <Text style={{ fontSize: 11, color: Colors.textMuted }}>{story.duration}</Text>
                    </View>
                    {story.moodImpact && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="trending-up" size={11} color={Colors.success} />
                        <Text style={{ fontSize: 11, color: Colors.success, fontWeight: '700' }}>+{story.moodImpact}% mood</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setPlaying(playing === story.id ? null : story.id)}
                  style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: playing === story.id ? Colors.success : Colors.purple, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name={playing === story.id ? 'pause' : 'play'} size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              {playing === story.id && (
                <View style={{ marginTop: 12, backgroundColor: Colors.successSoft, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="volume-high" size={16} color={Colors.success} />
                  <Text style={{ fontSize: 12, color: Colors.success, fontWeight: '700' }}>Playing in {patient.name}'s room...</Text>
                  <View style={{ flex: 1, height: 3, backgroundColor: Colors.success + '30', borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ width: '45%', height: '100%', backgroundColor: Colors.success, borderRadius: 2 }} />
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ─── MODAL — Create Story ─── */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resetModal}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          >

            {/* Modal header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.textPrimary }}>
                  Create Memory Story
                </Text>
                <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 2 }}>
                  For {patient.name}
                </Text>
              </View>
              <TouchableOpacity onPress={resetModal}>
                <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Photo picker */}
            <TouchableOpacity onPress={handlePickPhoto} style={{ marginBottom: 16 }}>
              {photo ? (
                <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: Colors.purple }}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={{ width: '100%', height: 200 }}
                    resizeMode="cover"
                  />
                  <View style={{ backgroundColor: Colors.purple, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Ionicons name="camera" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                      Tap to change photo
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.purple + '60', height: 180, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="cloud-upload-outline" size={48} color={Colors.purple + '80'} />
                  <Text style={{ color: Colors.purple, fontWeight: '700', fontSize: 15, marginTop: 10 }}>
                    Tap to select photo
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    Wedding, festival, family moments...
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Memory note */}
            <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: Colors.borderLight }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 }}>
                Your Memory Note
              </Text>
              <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 10 }}>
                What do you remember about this moment?
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.background, minHeight: 100 }}
                placeholder="e.g. Amma wore the red sari her mother chose. Thaththa was so nervous that morning. Grandmother cried happy tears."
                value={familyNote}
                onChangeText={setFamilyNote}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Generate button */}
            <TouchableOpacity
              onPress={handleGenerate}
              disabled={loading}
              style={{ backgroundColor: loading ? Colors.purple + '70' : Colors.purple, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                    {status || 'Creating story...'}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                    Generate Memory Story
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Story result */}
            {generatedStory ? (
              <View style={{ backgroundColor: Colors.purple + '10', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.purple + '30' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.purple, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="heart" size={18} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.purple }}>
                    Memory Story Ready
                  </Text>
                </View>

                <Text style={{ fontSize: 14, color: Colors.textPrimary, lineHeight: 22, fontStyle: 'italic', marginBottom: 16 }}>
                  "{generatedStory}"
                </Text>

                <TouchableOpacity
                  onPress={handleVoicePlayStop}
                  style={{ backgroundColor: voicePlaying ? '#EF4444' : Colors.success, borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}
                >
                  <Ionicons
                    name={voicePlaying ? 'stop-circle' : 'play-circle'}
                    size={22}
                    color="#fff"
                  />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {voicePlaying ? 'Stop Voice' : 'Play Voice Story'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Saved to Memory Vault',
                      `${patient.name} can listen to this story anytime.`,
                      [{ text: 'OK', onPress: resetModal }]
                    );
                  }}
                  style={{ backgroundColor: Colors.purple, borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    Saved to Vault
                  </Text>
                </TouchableOpacity>

              </View>
            ) : null}

          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}