// import { Button } from "@react-navigation/elements";
// import { useRouter } from "expo-router";
// import { Text, View } from "react-native";
// import "../global.css";

// export default function Index() {
//   const router = useRouter();

//   const handleLoginPress = () => {
//     router.push("/auth/login");
//   };

//   const handleOnboardingPress = () => {
//     router.push("/onboarding/1");
//   };

//   const handleRoleSelect = () => {
//     router.push("/role/select")
//   }

//   const handleAssessmentPage = () => {
//     router.push("/patient/cognitive/assessment")
//   }

//   return (
//     <View className="flex-1 justify-center items-center">
//       <Text className="text-4xl font-bold p-3">
//         This page should replace with the correct user's dashboard based on their login
//       </Text>
//       <Button onPressIn={handleLoginPress} className="bg-white text-white">
//         Login
//       </Button>
//       <Button onPressIn={handleOnboardingPress} className="bg-white text-white">
//         Go to onboarding pages
//       </Button>
//       <Button onPressIn={handleRoleSelect} className="bg-white text-white">
//         Go to Role Selector Page
//       </Button>
//        <Button onPressIn={handleAssessmentPage} className="bg-white text-white">
//         Go to Assessment Page
        
//       </Button>
//     </View>
//   );
// }

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { getAccessToken, getStoredRole } from '../src/api/authApi';

const HOME_BY_ROLE: Record<string, string> = {
  patient: '/patient/activity-selector',
  caregiver: '/caregiver',
  family: '/family',
};

export default function Index() {
  const router = useRouter();
  // undefined = still checking, null = no saved session, string = home route
  const [home, setHome] = useState<string | null | undefined>(undefined);

  // Restore the last logged-in user. loginUser() persists the tokens and role
  // to AsyncStorage, which survives app restarts; logoutUser() clears them.
  useEffect(() => {
    (async () => {
      const [token, role] = await Promise.all([getAccessToken(), getStoredRole()]);
      setHome(token && role ? HOME_BY_ROLE[role] ?? null : null);
    })();
  }, []);

  if (home === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (home) return <Redirect href={home as never} />;

  return (
    <View style={{
      flex: 1, backgroundColor: '#EFF6FF',
      alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 60, paddingHorizontal: 24,
    }}>

      {/* Logo */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={require('../assets/images/logo.png')}
          style={{ width: 180, height: 180 }}
          resizeMode="contain"
        />
        {/* <Text style={{ fontSize: 38, fontWeight: 'bold', color: '#1e40af', marginTop: 16 }}>
          MemoCare
        </Text> */}
        <Text style={{ fontSize: 16, color: '#6b7280', marginTop: 8, textAlign: 'center', lineHeight: 24 }}>
          Connected care for what matters most
        </Text>
      </View>

      {/* Buttons */}
      <View style={{ width: '100%', gap: 12 }}>

        {/* Get Started → onboarding intro slides */}
        <TouchableOpacity
          onPress={() => router.push('/onboarding')}
          style={{
            backgroundColor: '#2563eb', paddingVertical: 16,
            borderRadius: 14, alignItems: 'center',
            shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
          }}
        >
          <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
            Get Started
          </Text>
        </TouchableOpacity>

        {/* Login */}
        <TouchableOpacity
          onPress={() => router.push('/auth/login')}
          style={{
            backgroundColor: 'white', paddingVertical: 16,
            borderRadius: 14, alignItems: 'center',
            borderWidth: 2, borderColor: '#2563eb',
          }}
        >
          <Text style={{ color: '#2563eb', fontSize: 18, fontWeight: 'bold' }}>
            Already have an account?
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}