import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/colors';

interface DashboardHeaderProps {
  familyName: string;
  initials: string;
  patientName: string | null;
  alertCount: number;
  onNotificationPress: () => void;
  onProfilePress: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  familyName,
  initials,
  patientName,
  alertCount,
  onNotificationPress,
  onProfilePress,
}) => {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 56,
        paddingBottom: 20,
        backgroundColor: Colors.white,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: Greeting */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: Colors.textMuted, fontWeight: '500', marginBottom: 2 }}>
            {greeting},
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>
            {familyName} 👋
          </Text>
          {patientName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: Colors.success,
                  marginRight: 6,
                }}
              />
              <Text style={{ fontSize: 12, color: Colors.success, fontWeight: '600' }}>
                Linked to {patientName}
              </Text>
            </View>
          )}
        </View>

        {/* Right: Icons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Notification Bell */}
          <TouchableOpacity onPress={onNotificationPress} style={{ position: 'relative' }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: Colors.primaryLight,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.primary} />
            </View>
            {alertCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  backgroundColor: Colors.danger,
                  borderRadius: 8,
                  minWidth: 16,
                  height: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                  borderWidth: 2,
                  borderColor: Colors.white,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                  {alertCount > 9 ? '9+' : alertCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Profile Avatar */}
          <TouchableOpacity onPress={onProfilePress}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: '#E8D5F5',
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 2,
                borderColor: Colors.purple,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.purple }}>{initials}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
