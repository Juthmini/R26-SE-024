import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { getStoredRole } from '../../src/api/authApi';
import { Colors } from '../../src/constants/colors';

interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  badge?: number;
}

const TabBarIcon: React.FC<TabIconProps> = ({ name, color, size, badge }) => (
  <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={name} size={size} color={color} />
    {badge && badge > 0 ? (
      <View
        style={{
          position: 'absolute',
          top: -2, right: -2,
          backgroundColor: Colors.danger,
          borderRadius: 8,
          minWidth: 16, height: 16,
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
          {badge > 99 ? '99+' : badge}
        </Text>
      </View>
    ) : null}
  </View>
);

export default function FamilyLayout() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const role = await getStoredRole();
        console.log('FamilyLayout: role retrieved =', JSON.stringify(role));
        if (!role) { 
          console.log('FamilyLayout: role is NULL, redirecting to /auth/login');
          router.replace('/auth/login'); 
          return; 
        }
        if (role !== 'family') {
          console.log('FamilyLayout: wrong role encountered:', role);
          if (role === 'patient') router.replace('/patient/activity-selector');
          else if (role === 'caregiver') router.replace('/caregiver');
          return;
        }
        console.log('FamilyLayout: role is "family", continuing...');
      } catch (error) {
        router.replace('/auth/login');
      } finally {
        setIsChecking(false);
      }
    };
    checkRole();
  }, []);

  if (isChecking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 0,
          elevation: 20,
          shadowColor: '#4F8EF7',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
          paddingHorizontal: 8,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: 'absolute',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name={focused ? 'grid' : 'grid-outline'} color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="patient"
        options={{
          title: 'Patient',
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name={focused ? 'person' : 'person-outline'} color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="stories"
        options={{
          title: 'Stories',
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name={focused ? 'mic' : 'mic-outline'} color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name={focused ? 'chatbubble' : 'chatbubble-outline'} color={color} size={size} badge={1} />
          ),
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name={focused ? 'menu' : 'menu-outline'} color={color} size={size} />
          ),
        }}
      />

      {/* Hidden from tab bar */}
      <Tabs.Screen name="updates" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
    </Tabs>
  );
}
