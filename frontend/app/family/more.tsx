import { getStoredUser, logoutUser } from '@/src/api/authApi';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../src/constants/colors';
import { getLinkedPatient } from '../../src/services/family/familyService';
import { getMemorySessionReports, MemorySessionReport } from '../../src/services/family/emotionService';
import { getInitials } from '../../src/utils/nameHelpers';
import { LinkedPatient } from '../../src/types/family.types';

interface MenuRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
  badge?: number;
}

const Row: React.FC<MenuRow> = ({ icon, label, iconColor, iconBg, onPress, badge }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 }}>
    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: iconBg, justifyContent: 'center', alignItems: 'center' }}>
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary }}>{label}</Text>
    {badge ? (
      <View style={{ backgroundColor: Colors.danger, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
        <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>{badge}</Text>
      </View>
    ) : (
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    )}
  </TouchableOpacity>
);

export default function MoreScreen() {
  const [user, setUser] = useState<{ fullName: string; email: string } | null>(null);
  const [patient, setPatient] = useState<LinkedPatient | null>(null);
  const [reports, setReports] = useState<MemorySessionReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoredUser().then((u) => setUser(u ? { fullName: u.fullName, email: u.email } : null));
    getLinkedPatient().then((p) => {
      setPatient(p);
      if (p) {
        getMemorySessionReports(p.id).then(setReports).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const latestReport = reports[0] || null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Header */}
        <View style={{ backgroundColor: Colors.white, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>More</Text>
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 2 }}>Profile & settings</Text>
        </View>

        {/* Profile Card — real stored user */}
        <View style={{ margin: 20, backgroundColor: Colors.white, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8D5F5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.purple }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.purple }}>{getInitials(user?.fullName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: Colors.textPrimary }}>{user?.fullName || 'Family Member'}</Text>
            <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 2 }}>{user?.email || ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success }} />
              <Text style={{ fontSize: 12, color: Colors.success, fontWeight: '600' }}>Active account</Text>
            </View>
          </View>
          <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="pencil" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Session Summary — real data only; no call-duration/cognitive-score
            tiles, since nothing tracks those anywhere in the backend */}
        <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + '30', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="stats-chart" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#F8FAFC' }}>Session Summary</Text>
              <Text style={{ fontSize: 11, color: '#64748B' }}>Real mood data · Last session</Text>
            </View>
          </View>
          {loading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : !latestReport ? (
            <Text style={{ fontSize: 12, color: '#94A3B8', lineHeight: 18 }}>
              No memory sessions recorded yet.
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: latestReport.moodShiftPercent >= 0 ? Colors.success : Colors.danger }}>
                    {latestReport.moodShiftPercent > 0 ? '+' : ''}{latestReport.moodShiftPercent}%
                  </Text>
                  <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600', marginTop: 2 }}>MOOD SHIFT</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.primary }}>{latestReport.totalReadings}</Text>
                  <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600', marginTop: 2 }}>READINGS</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#94A3B8', lineHeight: 18 }}>
                "{latestReport.storyTitle}" — mood shifted from {latestReport.baselineEmotion} to {latestReport.finalEmotion}.
              </Text>
            </>
          )}
        </View>

        {/* Menu Sections */}
        {[
          {
            title: 'ACCOUNT',
            rows: [
              { icon: 'person-outline' as const, label: 'Edit Profile', iconColor: Colors.primary, iconBg: Colors.primaryLight, onPress: () => { } },
              { icon: 'lock-closed-outline' as const, label: 'Change Password', iconColor: Colors.purple, iconBg: Colors.purpleSoft, onPress: () => { } },
            ],
          },
          {
            title: 'LINKED PATIENT',
            rows: [
              { icon: 'heart-outline' as const, label: 'View Patient Profile', iconColor: Colors.danger, iconBg: Colors.dangerSoft, onPress: () => router.push('/family/patient') },
              { icon: 'call-outline' as const, label: 'Emergency Contacts', iconColor: Colors.success, iconBg: Colors.successSoft, onPress: () => { } },
            ],
          },
          {
            title: 'SUPPORT',
            rows: [
              { icon: 'help-circle-outline' as const, label: 'Help & FAQ', iconColor: Colors.accent, iconBg: Colors.accentSoft, onPress: () => { } },
              { icon: 'chatbox-outline' as const, label: 'Send Feedback', iconColor: Colors.primary, iconBg: Colors.primaryLight, onPress: () => { } },
            ],
          },
        ].map((section) => (
          <View key={section.title} style={{ marginHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 6, marginLeft: 4 }}>{section.title}</Text>
            <View style={{ backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
              {section.rows.map((row, i) => (
                <View key={row.label}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 16 }} />}
                  <Row {...row} />
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Log Out */}
        {/* Log Out */}
        <View style={{ marginHorizontal: 20, marginTop: 4 }}>
          <TouchableOpacity
            onPress={async () => {
              await logoutUser();
              router.replace('/');
            }}
            style={{ backgroundColor: Colors.dangerSoft, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.danger }}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
