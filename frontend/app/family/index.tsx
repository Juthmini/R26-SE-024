import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { router } from 'expo-router';

import { DashboardHeader }    from '../../src/components/family/dashboard/DashboardHeader';
import { PatientStatusCard }  from '../../src/components/family/dashboard/PatientStatusCard';
import { StatsGrid }          from '../../src/components/family/dashboard/StatsGrid';
import { SmartAlertCard }     from '../../src/components/family/dashboard/SmartAlertCard';
import { FollowUpPrompt }     from '../../src/components/family/dashboard/FollowUpPrompt';
import { LatestStoryCard }    from '../../src/components/family/dashboard/LatestStoryCard';
import { QuickActions }       from '../../src/components/family/dashboard/QuickActions';
import { RecentActivity }     from '../../src/components/family/dashboard/RecentActivity';

import {
  getLinkedPatient,
  getDashboardStats,
  getRecentUpdates,
} from '../../src/services/family/familyService';
import {
  acknowledgeAlert,
  getEngagementAlerts,
  getLatestEngagementAlert,
  getMemorySessionReports,
  MemorySessionReport,
  recordAction,
  recordFollowUp,
} from '../../src/services/family/emotionService';
import { EngagementAlert } from '../../src/types/family.types';
import { Colors } from '../../src/constants/colors';

export default function FamilyDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [alert, setAlert] = useState<EngagementAlert | null>(null);
  const [pendingFollowUp, setPendingFollowUp] = useState<EngagementAlert | null>(null);
  const [latestReport, setLatestReport] = useState<MemorySessionReport | null>(null);

  const patient      = getLinkedPatient();
  const stats        = getDashboardStats();
  const updates      = getRecentUpdates();

  // real mood-change alert from the most recent story-listening session —
  // a newer session's outcome naturally replaces whatever was shown before
  const loadAlert = useCallback(async () => {
    const latest = await getLatestEngagementAlert(patient.id, patient.name);
    setAlert(latest);
  }, [patient.id, patient.name]);

  // an alert the family already called about, but hasn't said how it went —
  // most recent first, since getEngagementAlerts preserves the backend's order
  const loadPendingFollowUp = useCallback(async () => {
    const alerts = await getEngagementAlerts(patient.id, patient.name);
    const pending = alerts.find((a) => a.actedAt && !a.followUpOutcome) || null;
    setPendingFollowUp(pending);
  }, [patient.id, patient.name]);

  // the latest listening session, shown regardless of whether it crossed
  // the alert threshold — so something always shows up front, not just
  // when a big mood swing happened
  const loadLatestReport = useCallback(async () => {
    const reports = await getMemorySessionReports(patient.id);
    setLatestReport(reports[0] || null);
  }, [patient.id]);

  useEffect(() => {
    loadAlert();
    loadPendingFollowUp();
    loadLatestReport();
  }, [loadAlert, loadPendingFollowUp, loadLatestReport]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadAlert(), loadPendingFollowUp(), loadLatestReport()]).finally(() => setRefreshing(false));
  };

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
          familyName="You"
          alertCount={alert?.isActive ? 1 : 0}
          onNotificationPress={() => router.push('/family/alerts')}
          onProfilePress={() => router.push('/family/more')}
        />

        {/* ── Patient Status ─────────────────────────────────────────────────── */}
        <PatientStatusCard
          patient={patient}
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
          onReminderPress={() => router.push('/family/updates')}
          onMedPress={() => router.push('/family/updates')}
          onMoodPress={() => router.push('/family/patient')}
          onAlertPress={() => router.push('/family/alerts')}
        />

        {/* ── Quick Actions ──────────────────────────────────────────────────── */}
        <QuickActions
          onStoriesPress={() => router.push('/family/stories')}
          onMessagesPress={() => router.push('/family/messages')}
          onUpdatesPress={() => router.push('/family/updates')}
        />

        {/* ── Recent Activity ────────────────────────────────────────────────── */}
        <RecentActivity
          updates={updates}
          onViewAll={() => router.push('/family/updates')}
        />
      </ScrollView>
    </View>
  );
}
