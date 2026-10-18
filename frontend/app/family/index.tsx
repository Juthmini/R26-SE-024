import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { router } from 'expo-router';

import { DashboardHeader }    from '../../src/components/family/dashboard/DashboardHeader';
import { PatientStatusCard }  from '../../src/components/family/dashboard/PatientStatusCard';
import { StatsGrid }          from '../../src/components/family/dashboard/StatsGrid';
import { SmartAlertCard }     from '../../src/components/family/dashboard/SmartAlertCard';
import { FollowUpPrompt }     from '../../src/components/family/dashboard/FollowUpPrompt';
import { LatestStoryCard }    from '../../src/components/family/dashboard/LatestStoryCard';
import { QuickActions }       from '../../src/components/family/dashboard/QuickActions';

import { getStoredUser } from '../../src/api/authApi';
import { getLinkedPatient } from '../../src/services/family/familyService';
import {
  acknowledgeAlert,
  getEngagementAlerts,
  getLatestEngagementAlert,
  getMemorySessionReports,
  MemorySessionReport,
  recordAction,
  recordFollowUp,
} from '../../src/services/family/emotionService';
import { buildWeeklyMoodHistory, emotionToMoodBucket, MOOD_EMOJI } from '../../src/utils/moodMapping';
import { getInitials } from '../../src/utils/nameHelpers';
import { EngagementAlert, FamilyDashboardStats, LinkedPatient } from '../../src/types/family.types';
import { Colors } from '../../src/constants/colors';

export default function FamilyDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [patient, setPatient] = useState<LinkedPatient | null>(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [alert, setAlert] = useState<EngagementAlert | null>(null);
  const [pendingFollowUp, setPendingFollowUp] = useState<EngagementAlert | null>(null);
  const [reports, setReports] = useState<MemorySessionReport[]>([]);

  const latestReport = reports[0] || null;

  const stats: FamilyDashboardStats = {
    moodScore: Math.round(latestReport?.happyAfterPercent ?? 0),
    activeAlerts: alert?.isActive ? 1 : 0,
  };

  // overrides the honest placeholder mood fields from getLinkedPatient()
  // with real values derived from the session reports fetched below
  const displayPatient: LinkedPatient | null = patient && {
    ...patient,
    currentMood: emotionToMoodBucket(latestReport?.finalEmotion, latestReport?.happyAfterPercent),
    moodEmoji: MOOD_EMOJI[emotionToMoodBucket(latestReport?.finalEmotion, latestReport?.happyAfterPercent)],
    lastUpdated: latestReport?.triggeredAt ?? 'No sessions yet',
    moodHistory: reports.length ? buildWeeklyMoodHistory(reports) : patient.moodHistory,
  };

  useEffect(() => {
    getLinkedPatient().then(setPatient).finally(() => setPatientLoading(false));
    getStoredUser().then((u) => setFamilyName(u?.fullName || null));
  }, []);

  // real mood-change alert from the most recent story-listening session —
  // a newer session's outcome naturally replaces whatever was shown before
  const loadAlert = useCallback(async () => {
    if (!patient) return;
    const latest = await getLatestEngagementAlert(patient.id, patient.name);
    setAlert(latest);
  }, [patient]);

  // an alert the family already called about, but hasn't said how it went —
  // most recent first, since getEngagementAlerts preserves the backend's order
  const loadPendingFollowUp = useCallback(async () => {
    if (!patient) return;
    const alerts = await getEngagementAlerts(patient.id, patient.name);
    const pending = alerts.find((a) => a.actedAt && !a.followUpOutcome) || null;
    setPendingFollowUp(pending);
  }, [patient]);

  // full session history — latestReport (= reports[0]) drives the "latest
  // story" card and real stats; the whole list drives the 7-day mood strip
  const loadReports = useCallback(async () => {
    if (!patient) return;
    const data = await getMemorySessionReports(patient.id);
    setReports(data);
  }, [patient]);

  useEffect(() => {
    if (!patient) return;
    loadAlert();
    loadPendingFollowUp();
    loadReports();
  }, [patient, loadAlert, loadPendingFollowUp, loadReports]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadAlert(), loadPendingFollowUp(), loadReports()]).finally(() => setRefreshing(false));
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
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <DashboardHeader
          familyName={familyName || 'there'}
          initials={getInitials(familyName)}
          patientName={patient.name}
          alertCount={alert?.isActive ? 1 : 0}
          onNotificationPress={() => router.push('/family/alerts')}
          onProfilePress={() => router.push('/family/more')}
        />

        {/* ── Patient Status ─────────────────────────────────────────────────── */}
        <PatientStatusCard
          patient={displayPatient!}
          onPress={() => router.push('/family/patient')}
        />

        {/* ── Latest Story Watched — always shown, not just on alert-worthy sessions ── */}
        {latestReport && (
          <LatestStoryCard report={latestReport} patientName={patient.name} />
        )}

        {/* ── Smart Alert (Predictive Engagement Engine) ─────────────────────── */}
        {alert?.isActive && (
          <SmartAlertCard
            alert={alert}
            onCallNow={() => {
              // Future: open phone dialler or in-app call
              recordAction(alert.id).then(() => {
                loadAlert();
                loadPendingFollowUp();
              });
            }}
            onDismiss={() => {
              acknowledgeAlert(alert.id).then(() => loadAlert());
            }}
          />
        )}

        {/* ── Follow-up — did the call actually help? ─────────────────────────── */}
        {pendingFollowUp && (
          <FollowUpPrompt
            alert={pendingFollowUp}
            onAnswer={(outcome) => {
              recordFollowUp(pendingFollowUp.id, outcome).then(() => setPendingFollowUp(null));
            }}
          />
        )}

        {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
        <StatsGrid
          stats={stats}
          onMoodPress={() => router.push('/family/patient')}
          onAlertPress={() => router.push('/family/alerts')}
        />

        {/* ── Quick Actions ──────────────────────────────────────────────────── */}
        <QuickActions
          onStoriesPress={() => router.push('/family/stories')}
          onCalendarPress={() => router.push('/family/calendar')}
        />
      </ScrollView>
    </View>
  );
}
