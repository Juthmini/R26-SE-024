import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../src/constants/colors';
import { getLinkedPatient } from '../../src/services/family/familyService';
import { buildShareableReport, getMemorySessionReports, MemorySessionReport } from '../../src/services/family/emotionService';

const routineItems = [
  { time: '8:00 AM',  task: 'Morning medication',    done: true,  icon: 'medical' },
  { time: '9:30 AM',  task: 'Breakfast & hydration', done: true,  icon: 'restaurant' },
  { time: '11:00 AM', task: 'Memory story session',  done: true,  icon: 'mic' },
  { time: '1:00 PM',  task: 'Lunch',                 done: false, icon: 'restaurant' },
  { time: '3:00 PM',  task: 'Afternoon walk',        done: false, icon: 'walk' },
  { time: '6:00 PM',  task: 'Evening medication',    done: false, icon: 'medical' },
];

export default function PatientScreen() {
  const patient = getLinkedPatient();
  const [reports, setReports] = useState<MemorySessionReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  useEffect(() => {
    getMemorySessionReports(patient.id)
      .then(setReports)
      .finally(() => setLoadingReports(false));
  }, [patient.id]);

  const shareReport = async (single?: MemorySessionReport) => {
    const text = buildShareableReport(patient.name, single ? [single] : reports);
    try {
      await Share.share({ message: text });
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Header */}
        <View style={{ backgroundColor: Colors.white, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>Patient Overview</Text>
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 2 }}>Linked patient details & daily routine</Text>
        </View>

        {/* Profile Card */}
        <View style={{ margin: 20, backgroundColor: Colors.white, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: patient.avatarColor + '22', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: patient.avatarColor }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: patient.avatarColor }}>{patient.initials}</Text>
            </View>
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>{patient.name}</Text>
              <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 2 }}>{patient.stage} · Age {patient.age}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: Colors.warningSoft }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.warning }}>{patient.condition}</Text>
                </View>
                <Text style={{ fontSize: 20 }}>{patient.moodEmoji}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 7-day mood */}
        <View style={{ marginHorizontal: 20, backgroundColor: Colors.white, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 12, letterSpacing: 0.5 }}>7-DAY MOOD HISTORY</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map((day, i) => {
              const emojis = ['😔','😊','😊','😄','😊','😔','😊'];
              const isToday = i === 6;
              return (
                <View key={day} style={{ flex: 1, alignItems: 'center', backgroundColor: isToday ? Colors.primaryLight : Colors.background, borderRadius: 12, paddingVertical: 10, borderWidth: isToday ? 1 : 0, borderColor: Colors.primary }}>
                  <Text style={{ fontSize: isToday ? 22 : 18 }}>{emojis[i]}</Text>
                  <Text style={{ fontSize: 9, color: isToday ? Colors.primary : Colors.textMuted, fontWeight: '700', marginTop: 4 }}>{day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Memory Session Reports — real data, shareable with a caregiver */}
        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 }}>MEMORY SESSION REPORTS</Text>
            {reports.length > 0 && (
              <TouchableOpacity
                onPress={() => shareReport()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Ionicons name="share-social-outline" size={13} color={Colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>Share All</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingReports ? (
            <Text style={{ fontSize: 12, color: Colors.textMuted, paddingVertical: 12 }}>Loading...</Text>
          ) : reports.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 20, padding: 20, alignItems: 'center' }}>
              <Ionicons name="mic-off-outline" size={28} color={Colors.textMuted} />
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8, textAlign: 'center' }}>
                No memory sessions recorded yet. Once {patient.name} listens to a story, the mood results will appear here.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
              {reports.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 16 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>{r.storyTitle}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                        {r.date} · {r.baselineEmotion} → {r.finalEmotion} · {r.moodShiftPercent > 0 ? '+' : ''}{r.moodShiftPercent}%
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => shareReport(r)} style={{ padding: 6 }}>
                      <Ionicons name="share-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Daily Routine */}
        <View style={{ marginHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>TODAY'S ROUTINE</Text>
          <View style={{ backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
            {routineItems.map((item, i) => (
              <View key={i}>
                {i > 0 && <View style={{ height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 16 }} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.done ? Colors.successSoft : Colors.background, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.done ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: item.done ? Colors.textMuted : Colors.textPrimary, textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.task}</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>{item.time}</Text>
                  </View>
                  <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={item.done ? Colors.success : Colors.border} />
                </View>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
