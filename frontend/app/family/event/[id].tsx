import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../src/constants/colors';
import { getEventReactions, markReactionSeen } from '../../../src/services/family/calendarService';
import { EventReaction } from '../../../src/types/family.types';

const EMOJI_MAP: Record<string, string> = { happy: '😊', calm: '😌', sad: '😢' };

const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
};

export default function EventReactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reactions, setReactions] = useState<EventReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const loadReactions = useCallback(async () => {
    if (!id) return;
    const items = await getEventReactions(id);
    setReactions(items);
    setLoading(false);
    // mark any not-yet-seen reactions as seen now that the family opened this view
    items.filter((r) => !r.seenByFamilyAt).forEach((r) => markReactionSeen(id, r.id));
  }, [id]);

  useEffect(() => {
    loadReactions();
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, [id, loadReactions]);

  // real-time-ish: picks up a reaction the patient just sent without a
  // manual refresh — every time this screen is reopened, plus a 60s poll
  // while it stays open (same ceiling as the rest of the app; true push
  // would need a dev build, out of reach here)
  useFocusEffect(
    useCallback(() => {
      loadReactions();
      const interval = setInterval(loadReactions, 60000);
      return () => clearInterval(interval);
    }, [loadReactions])
  );

  const stopPlayback = () => {
    playerRef.current?.pause();
    playerRef.current?.remove();
    playerRef.current = null;
    setPlayingId(null);
  };

  const togglePlay = async (reaction: EventReaction) => {
    if (playingId === reaction.id) {
      stopPlayback();
      return;
    }
    stopPlayback();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const player = createAudioPlayer({ uri: reaction.mediaUrl });
    playerRef.current = player;
    setPlayingId(reaction.id);
    const sub = (player as any).addListener('playbackStatusUpdate', (s: { didJustFinish?: boolean }) => {
      if (s.didJustFinish) {
        sub.remove();
        stopPlayback();
      }
    });
    player.play();
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        <View style={{ backgroundColor: Colors.white, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/family/calendar'))} style={{ marginBottom: 12 }}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>Reactions</Text>
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 2 }}>What they sent back for this event</Text>
        </View>

        <View style={{ marginHorizontal: 20, marginTop: 20 }}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : reactions.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 20, padding: 24, alignItems: 'center' }}>
              <Ionicons name="heart-outline" size={28} color={Colors.textMuted} />
              <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 10, textAlign: 'center' }}>
                No reaction yet — it will show up here once they respond.
              </Text>
            </View>
          ) : (
            reactions.map((reaction) => (
              <View key={reaction.id} style={{ backgroundColor: Colors.white, borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {reaction.type === 'emoji' && reaction.emoji && (
                      <Text style={{ fontSize: 24 }}>{EMOJI_MAP[reaction.emoji]}</Text>
                    )}
                    {reaction.type === 'voice' && (
                      <Ionicons name="mic" size={20} color={Colors.purple} />
                    )}
                    {reaction.type === 'skipped' && (
                      <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>
                      {reaction.type === 'emoji' ? 'Emoji reply' : reaction.type === 'voice' ? 'Voice wish' : 'Skipped for now'}
                    </Text>
                  </View>
                  <Ionicons
                    name={reaction.seenByFamilyAt ? 'checkmark-done' : 'checkmark'}
                    size={16}
                    color={reaction.seenByFamilyAt ? Colors.success : Colors.textMuted}
                  />
                </View>

                {reaction.type === 'voice' && reaction.mediaUrl && (
                  <TouchableOpacity
                    onPress={() => togglePlay(reaction)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.purpleSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' }}
                  >
                    <Ionicons name={playingId === reaction.id ? 'stop-circle' : 'play-circle'} size={20} color={Colors.purple} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.purple }}>
                      {playingId === reaction.id ? 'Playing…' : `Play (${reaction.durationSeconds}s)`}
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 8 }}>{timeAgo(reaction.createdAt)}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}
