import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { LogoutConfirmModal } from '../../common/LogoutConfirmModal';

interface LogoutButtonProps {
  onLogout: () => void;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ onLogout }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleConfirmLogout = async () => {
    await new Promise((r) => setTimeout(r, 800));
    setShowConfirm(false);
    onLogout();
  };

  return (
    <>
      {/* Logout row */}
      <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
        <View
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: Colors.dangerSoft,
            shadowColor: Colors.danger,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 1,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowConfirm(true)}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: Colors.white,
              borderRadius: 18,
            }}
          >
            <View
              style={{
                width: 38, height: 38,
                borderRadius: 12,
                backgroundColor: Colors.dangerSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </View>
            <Text
              style={{
                flex: 1, fontSize: 14,
                fontWeight: '600', color: Colors.danger,
              }}
            >
              Log Out
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.danger + '80'} />
          </TouchableOpacity>
        </View>
      </View>

      <LogoutConfirmModal
        visible={showConfirm}
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleConfirmLogout}
      />
    </>
  );
};