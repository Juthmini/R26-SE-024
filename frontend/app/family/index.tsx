import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { router } from 'expo-router';

import { DashboardHeader }    from '../../src/components/family/dashboard/DashboardHeader';
import { PatientStatusCard }  from '../../src/components/family/dashboard/PatientStatusCard';
import { StatsGrid }          from '../../src/components/family/dashboard/StatsGrid';
import { SmartAlertCard }     from '../../src/components/family/dashboard/SmartAlertCard';
import { QuickActions }       from '../../src/components/family/dashboard/QuickActions';
import { RecentActivity }     from '../../src/components/family/dashboard/RecentActivity';

import {
  getLinkedPatient,
  getDashboardStats,
  getRecentUpdates,
} from '../../src/services/family/familyService';
import { getLatestEngagementAlert } from '../../src/services/family/emotionService';
import { EngagementAlert } from '../../src/types/family.types';
import { Colors } from '../../src/constants/colors';

export default function FamilyDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [alert, setAlert] = useState<EngagementAlert | null>(null);

  const patient      = getLinkedPatient();
  const stats        = getDashboardStats();
  const updates      = getRecentUpdates();

  // real mood-change alert from the most recent story-listening session —
  // a newer session's outcome naturally replaces whatever was shown before
  const loadAlert = useCallback(async () => {
    const latest = await getLatestEngagementAlert(patient.id, patient.name);
    setAlert(latest);
  }, [patient.id, patient.name]);

  useEffect(() => { loadAlert(); }, [loadAlert]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAlert().finally(() => setRefreshing(false));
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
          alertCount={stats.activeAlerts}
          onNotificationPress={() => router.push('/family/updates')}
          onProfilePress={() => router.push('/family/more')}
        />

        {/* ── Patient Status ─────────────────────────────────────────────────── */}
        <PatientStatusCard
          patient={patient}
          onPress={() => router.push('/family/patient')}
        />

        {/* ── Smart Alert (Predictive Engagement Engine) ─────────────────────── */}
        {alert?.isActive && (
          <SmartAlertCard
            alert={alert}
            onCallNow={() => {
              // Future: open phone dialler or in-app call
              console.log('Calling patient...');
            }}
            onDismiss={() => {
              // Future: dismiss alert via API
              console.log('Alert dismissed');
            }}
          />
        )}

        {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
        <StatsGrid
          stats={stats}
          onReminderPress={() => router.push('/family/updates')}
          onMedPress={() => router.push('/family/updates')}
          onMoodPress={() => router.push('/family/patient')}
          onAlertPress={() => router.push('/family/updates')}
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
