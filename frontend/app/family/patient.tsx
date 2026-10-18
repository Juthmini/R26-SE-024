import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../src/constants/colors';
import { getLinkedPatient } from '../../src/services/family/familyService';
import { buildShareableReport, getMemorySessionReports, MemorySessionReport } from '../../src/services/family/emotionService';
import { MoodTrendChart } from '../../src/components/family/MoodTrendChart';
import { buildWeeklyMoodHistory, MOOD_EMOJI } from '../../src/utils/moodMapping';
import { LinkedPatient } from '../../src/types/family.types';

// real day labels for the last 7 calendar days, oldest first, ending today —
// paired index-for-index with buildWeeklyMoodHistory()'s output
const last7DayLabels = () => {
  const labels: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
  }
  return labels;
};

export default function PatientScreen() {
  const [patient, setPatient] = useState<LinkedPatient | null>(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [reports, setReports] = useState<MemorySessionReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  useEffect(() => {
    getLinkedPatient().then(setPatient).finally(() => setPatientLoading(false));
  }, []);

  useEffect(() => {
    if (!patient) return;
    getMemorySessionReports(patient.id)
      .then(setReports)
      .finally(() => setLoadingReports(false));
  }, [patient]);

  const shareReport = async (single?: MemorySessionReport) => {
    if (!patient) return;
    const text = buildShareableReport(patient.name, single ? [single] : reports);
    try {
      await Share.share({ message: text });
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  };

  if (patientLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!patient) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 14, color: Colors.textMuted, textAlign: 'center' }}>
          We couldn't find a patient linked to your account. Please check your registration or contact support.
        </Text>
      </View>
    );
  }

  const weeklyMoods = buildWeeklyMoodHistory(reports);

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

        {/* 7-day mood — real, derived from actual session outcomes; days with
            no recorded session show a neutral "no data" bucket rather than
            a guess */}
        <View style={{ marginHorizontal: 20, backgroundColor: Colors.white, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 12, letterSpacing: 0.5 }}>7-DAY MOOD HISTORY</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {last7DayLabels().map((day, i) => {
              const isToday = i === 6;
              return (
                <View key={`${day}-${i}`} style={{ flex: 1, alignItems: 'center', backgroundColor: isToday ? Colors.primaryLight : Colors.background, borderRadius: 12, paddingVertical: 10, borderWidth: isToday ? 1 : 0, borderColor: Colors.primary }}>
                  <Text style={{ fontSize: isToday ? 22 : 18 }}>{MOOD_EMOJI[weeklyMoods[i]]}</Text>
                  <Text style={{ fontSize: 9, color: isToday ? Colors.primary : Colors.textMuted, fontWeight: '700', marginTop: 4 }}>{day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Mood Trend — real per-session mood shift, oldest to newest */}
        {!loadingReports && reports.length > 0 && (
          <View style={{ marginHorizontal: 20 }}>
            <MoodTrendChart reports={reports} />
          </View>
        )}

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
                    {r.photoUrl ? (
                      <Image source={{ uri: r.photoUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} />
                    ) : (
                      <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: Colors.purpleSoft, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="image-outline" size={20} color={Colors.purple} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: Colors.purpleSoft }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.purple, textTransform: 'capitalize' }}>{r.category}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: Colors.textMuted }}>{r.date}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: Colors.textPrimary, marginTop: 3 }} numberOfLines={1}>{r.storyTitle}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                        Mood: {r.baselineEmotion} → {r.finalEmotion} ({r.moodShiftPercent > 0 ? '+' : ''}{r.moodShiftPercent}%)
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

        {/* Daily Routine — real, from the patient's care record */}
        <View style={{ marginHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>TODAY'S ROUTINE</Text>
          {patient.routines.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 20, padding: 20, alignItems: 'center' }}>
              <Ionicons name="list-outline" size={26} color={Colors.textMuted} />
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8, textAlign: 'center' }}>
                No routine items added yet.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
              {patient.routines.map((item, i) => (
                <View key={`${item.title}-${i}`}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 16 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.completed ? Colors.successSoft : Colors.background, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="medical" size={18} color={item.completed ? Colors.success : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: item.completed ? Colors.textMuted : Colors.textPrimary, textDecorationLine: item.completed ? 'line-through' : 'none' }}>{item.title}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>{item.time}</Text>
                    </View>
                    <Ionicons name={item.completed ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={item.completed ? Colors.success : Colors.border} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}
