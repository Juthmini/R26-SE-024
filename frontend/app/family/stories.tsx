import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { getLinkedPatient } from '../../src/services/family/familyService';
import {
  CategoryRecommendationResponse,
  FamilyMemoryItem,
  deleteMemoryById,
  generateStoryFromPhoto,
  getCategoryRecommendation,
  getMemoriesForPatient,
  pickPhoto,
} from '../../src/services/family/storyService';
import { speakStory, stopSpeaking } from '../../src/services/family/ttsService';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const CATEGORY_OPTIONS = [
  { key: 'wedding', label: 'Wedding' },
  { key: 'festival', label: 'Festival' },
  { key: 'temple', label: 'Temple' },
  { key: 'career', label: 'Career' },
  { key: 'food', label: 'Food' },
  { key: 'travel', label: 'Travel' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'childhood', label: 'Childhood' },
  { key: 'friends', label: 'Friends' },
  { key: 'home', label: 'Home' },
  { key: 'other', label: 'Other' },
];

const categoryLabel = (key: string) =>
  CATEGORY_OPTIONS.find((c) => c.key === key)?.label || key;

export default function StoriesScreen() {
  const router = useRouter();
  const patient = getLinkedPatient();   // gives us patient.id = 'p-001'

  const [stories, setStories] = useState<FamilyMemoryItem[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadStories = () => {
    getMemoriesForPatient(patient.id).then((items) => {
      setStories(items);
      setStoriesLoading(false);
    });
  };

  useEffect(() => { loadStories(); }, [patient.id]);

  const handlePlayStory = (story: FamilyMemoryItem) => {
    if (playing === story._id) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    stopSpeaking();
    setPlaying(story._id);
    speakStory(story.generatedStory, () => setPlaying(null));
  };

  const handleDeleteStory = (story: FamilyMemoryItem) => {
    Alert.alert(
      'Delete this story?',
      'This removes it permanently from the memory vault for both of you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (playing === story._id) { stopSpeaking(); setPlaying(null); }
            setDeletingId(story._id);
            const ok = await deleteMemoryById(story._id);
            if (ok) {
              setStories((prev) => prev.filter((s) => s._id !== story._id));
            } else {
              Alert.alert('Error', 'Could not delete this story. Try again.');
            }
            setDeletingId(null);
          },
        },
      ]
    );
  };

  // upload state
  const [photo, setPhoto] = useState<any>(null);
  const [familyNote, setFamilyNote] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  // result state
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [generatedStory, setGeneratedStory] = useState('');
  const [voicePlaying, setVoicePlaying] = useState(false);

  // adaptive recommendation — which category tends to lift this patient's
  // mood the most, based on real past listening sessions
  const [recommendation, setRecommendation] = useState<CategoryRecommendationResponse | null>(null);

  useEffect(() => {
    getCategoryRecommendation(patient.id).then(setRecommendation);
  }, [patient.id]);

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
    if (!category) {
      Alert.alert('Missing', 'Please choose a memory category');
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
        category,
      });

      if (result.success) {
        setGeneratedStory(result.memory.generatedStory);
        setStatus('');
        setVoicePlaying(true);
        speakStory(result.memory.generatedStory, () => setVoicePlaying(false));
        loadStories(); // new story now shows in "Your Stories" immediately
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
    setCategory(null);
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

        {/* Adaptive recommendation — what's actually working, from real data */}
        {recommendation && (
          <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.purple + '15', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.purple + '30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.purpleSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                <Ionicons name="bulb" size={22} color={Colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.purple, marginBottom: 4 }}>What's Working</Text>
                {recommendation.recommendation ? (
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                    {categoryLabel(recommendation.recommendation.category)} stories have lifted {patient.name}'s mood by an average of{' '}
                    {recommendation.recommendation.avgMoodShiftPercent > 0 ? '+' : ''}
                    {recommendation.recommendation.avgMoodShiftPercent}% over {recommendation.recommendation.sessionCount} sessions — worth creating another one.
                  </Text>
                ) : recommendation.totalSessions === 0 ? (
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                    Create a few memory stories and let {patient.name} listen to them — we'll start suggesting what works best.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                    Still gathering data — a couple more sessions per category will unlock a suggestion.
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Upload button — connects to modal */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowModal(true)}
          style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: Colors.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }}
        >
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Upload Photo & Create Story</Text>
        </TouchableOpacity>

        {/* Stories list — real, deletable memories */}
        <View style={{ marginHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>YOUR STORIES</Text>

          {storiesLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.purple} />
            </View>
          ) : stories.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight }}>
              <Ionicons name="images-outline" size={26} color={Colors.textMuted} />
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8, textAlign: 'center' }}>
                No stories yet — create one above.
              </Text>
            </View>
          ) : (
            stories.map((story) => (
              <View key={story._id} style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: Colors.borderLight }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  {story.photoUrl ? (
                    <Image source={{ uri: story.photoUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: Colors.purpleSoft, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="images" size={26} color={Colors.purple} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.textPrimary }}>{categoryLabel(story.category)}</Text>
                    <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 4 }} numberOfLines={2}>{story.familyNote}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                        <Text style={{ fontSize: 11, color: Colors.textMuted }}>{formatDate(story.createdAt)}</Text>
                      </View>
                      {story.playCount > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="play-circle-outline" size={11} color={Colors.textMuted} />
                          <Text style={{ fontSize: 11, color: Colors.textMuted }}>{story.playCount} plays</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handlePlayStory(story)}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: playing === story._id ? Colors.success : Colors.purple, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Ionicons name={playing === story._id ? 'stop' : 'play'} size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteStory(story)}
                    disabled={deletingId === story._id}
                    style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}
                  >
                    {deletingId === story._id ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                    )}
                  </TouchableOpacity>
                </View>

                {/* full story text stays visible the whole time it's being read aloud */}
                {playing === story._id && (
                  <View style={{ marginTop: 12, backgroundColor: Colors.purpleSoft, borderRadius: 10, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: Colors.textPrimary, lineHeight: 18, fontStyle: 'italic' }}>"{story.generatedStory}"</Text>
                  </View>
                )}
              </View>
            ))
          )}
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

            {/* Category picker */}
            <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.borderLight }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 }}>
                Category
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setCategory(opt.key)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: category === opt.key ? Colors.primary : Colors.white,
                      borderWidth: 1,
                      borderColor: category === opt.key ? Colors.primary : Colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: category === opt.key ? '#fff' : Colors.textMuted }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

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