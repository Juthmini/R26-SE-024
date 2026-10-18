import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/colors';

interface QuickActionsProps {
  onStoriesPress: () => void;
  onMessagesPress: () => void;
  onUpdatesPress: () => void;
  onCalendarPress: () => void;
}

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bgColor: string;
  onPress: () => void;
  badge?: number;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon, label, color, bgColor, onPress, badge,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={{
      flex: 1,
      backgroundColor: Colors.white,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: Colors.borderLight,
    }}
  >
    <View style={{ position: 'relative' }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: bgColor,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={24} color={color} />
      </View>
      {badge && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: Colors.danger,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: Colors.white,
          }}
        >
          <Text style={{ fontSize: 9, color: '#fff', fontWeight: '800' }}>{badge}</Text>
        </View>
      ) : null}
    </View>
    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' }}>
      {label}
    </Text>
  </TouchableOpacity>
);

export const QuickActions: React.FC<QuickActionsProps> = ({
  onStoriesPress, onMessagesPress, onUpdatesPress, onCalendarPress,
}) => (
  <View style={{ marginHorizontal: 20, marginTop: 20 }}>
    <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>
      QUICK ACTIONS
    </Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <View style={{ flexBasis: '47%', flexGrow: 1 }}>
        <ActionButton
          icon="mic"
          label="Memory Stories"
          color={Colors.purple}
          bgColor={Colors.purpleSoft}
          onPress={onStoriesPress}
        />
      </View>
      <View style={{ flexBasis: '47%', flexGrow: 1 }}>
        <ActionButton
          icon="chatbubbles"
          label="Messages"
          color={Colors.primary}
          bgColor={Colors.primaryLight}
          onPress={onMessagesPress}
          badge={1}
        />
      </View>
      <View style={{ flexBasis: '47%', flexGrow: 1 }}>
        <ActionButton
          icon="document-text"
          label="Care Updates"
          color={Colors.accent}
          bgColor={Colors.accentSoft}
          onPress={onUpdatesPress}
        />
      </View>
      <View style={{ flexBasis: '47%', flexGrow: 1 }}>
        <ActionButton
          icon="calendar"
          label="Calendar"
          color={Colors.success}
          bgColor={Colors.successSoft}
          onPress={onCalendarPress}
        />
      </View>
    </View>
  </View>
);
