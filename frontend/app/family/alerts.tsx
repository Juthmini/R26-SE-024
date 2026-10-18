import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../src/constants/colors';
import { getLinkedPatient } from '../../src/services/family/familyService';
import {
  acknowledgeAlert,
  EngagementStats,
  getEngagementAlerts,
  getEngagementStats,
  recordAction,
} from '../../src/services/family/emotionService';
import { EngagementAlert, LinkedPatient } from '../../src/types/family.types';

export default function AlertsScreen() {
  const [patient, setPatient] = useState<LinkedPatient | null>(null);
  const [patientLoading, setPatientLoading] = useState(true);

  const [alerts, setAlerts] = useState<EngagementAlert[]>([]);
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [calling, setCalling] = useState<string | null>(null);

  useEffect(() => {
    getLinkedPatient().then(setPatient).finally(() => setPatientLoading(false));
  }, []);

  const loadAlerts = useCallback(() => {
    if (!patient) return Promise.resolve();
    return getEngagementAlerts(patient.id, patient.name).then(setAlerts);
  }, [patient]);

  const loadStats = useCallback(() => {
    if (!patient) return Promise.resolve();
    return getEngagementStats(patient.id).then(setStats);
  }, [patient]);

  useEffect(() => {
    if (!patient) return;
    Promise.all([loadAlerts(), loadStats()]).finally(() => setLoading(false));
  }, [patient, loadAlerts, loadStats]);

  const handleAcknowledge = async (alert: EngagementAlert) => {
    setAcknowledging(alert.id);
    const ok = await acknowledgeAlert(alert.id);
    if (ok) {
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, acknowledged: true, isActive: false } : a)));
    }
    setAcknowledging(null);
  };

  const handleCallNow = async (alert: EngagementAlert) => {
    setCalling(alert.id);
    const ok = await recordAction(alert.id);
    if (ok) {
      setAlerts((prev) => prev.map((a) => (
        a.id === alert.id ? { ...a, acknowledged: true, isActive: false, actedAt: new Date().toISOString() } : a
      )));
      loadStats();
    }
    setCalling(null);
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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Header */}
        <View style={{ backgroundColor: Colors.white, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/family'))} style={{ marginBottom: 12 }}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>Engagement Alerts</Text>
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 2 }}>
            Real mood-lift alerts from {patient.name}'s story sessions
          </Text>
        </View>

        {/* Engagement stats — real evidence of whether alerts actually help */}
        {!loading && stats && (
          <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: Colors.white, borderRadius: 18, padding: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 10 }}>ENGAGEMENT</Text>
            {stats.totalAlerts === 0 ? (
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>Not enough data yet.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>
                    {stats.actedOn}/{stats.totalAlerts} ({stats.responseRate}%)
                  </Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted }}>Alerts acted on</Text>
                </View>
                {stats.avgResponseMinutes !== null && (
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>{stats.avgResponseMinutes}m</Text>
                    <Text style={{ fontSize: 10, color: Colors.textMuted }}>Avg. response time</Text>
                  </View>
                )}
                {stats.positiveOutcomeRate !== null && (
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.success }}>{stats.positiveOutcomeRate}%</Text>
                    <Text style={{ fontSize: 10, color: Colors.textMuted }}>Calls that went well</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        <View style={{ marginHorizontal: 20, marginTop: 20 }}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : alerts.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 20, padding: 24, alignItems: 'center' }}>
              <Ionicons name="notifications-off-outline" size={28} color={Colors.textMuted} />
              <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 10, textAlign: 'center' }}>
                No alerts yet. When a story session lifts {patient.name}'s mood enough, it will show up here.
              </Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <View
                key={alert.id}
                style={{
                  backgroundColor: Colors.white,
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: alert.acknowledged ? 0 : 1.5,
                  borderColor: Colors.success,
                  opacity: alert.acknowledged ? 0.7 : 1,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                {/* Title row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.textPrimary, flex: 1 }} numberOfLines={1}>
                    "{alert.storyTitle}"
                  </Text>
                  {alert.acknowledged ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.background }}>
                      <Ionicons name={alert.actedAt ? 'call' : 'checkmark-circle'} size={12} color={Colors.textMuted} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.textMuted }}>{alert.actedAt ? 'Called' : 'Acknowledged'}</Text>
                    </View>
                  ) : (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.successSoft }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.success }}>NEW</Text>
                    </View>
                  )}
                </View>

                {/* Mood numbers */}
                <View style={{ flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 12, padding: 10, marginBottom: 10, gap: 12 }}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, fontWeight: '700', marginBottom: 2 }}>SAD BEFORE</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#F87171' }}>{alert.sadBefore}%</Text>
                  </View>
                  <View style={{ alignItems: 'center', flex: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.borderLight }}>
                    <Text style={{ fontSize: 9, color: Colors.success, fontWeight: '700', marginBottom: 2 }}>MOOD SHIFT</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.success }}>+{alert.moodShift}%</Text>
                  </View>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, fontWeight: '700', marginBottom: 2 }}>HAPPY NOW</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#4ADE80' }}>{alert.happyAfter}%</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 10 }}>{alert.message}</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                    <Text style={{ fontSize: 11, color: Colors.textMuted }}>{alert.triggeredAt}</Text>
                  </View>

                  {!alert.acknowledged && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleCallNow(alert)}
                        disabled={calling === alert.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                      >
                        {calling === alert.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="call" size={12} color="#fff" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Call Now</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleAcknowledge(alert)}
                        disabled={acknowledging === alert.id}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.border }}
                      >
                        {acknowledging === alert.id ? (
                          <ActivityIndicator size="small" color={Colors.textMuted} />
                        ) : (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted }}>Acknowledge</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}
