import { registerUser, storage } from '@/src/api/authApi';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function FamilyRegister() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

const handleRegister = async () => {
  console.log('family.tsx: Starting handleRegister...');
  console.log('family.tsx: State =', { fullName, email, passwordLength: password.length, confirmLength: confirmPassword.length });

  if (!fullName || !email || !patientEmail || !password || !confirmPassword) {
    console.log('family.tsx: Validation FAILED - Missing fields');
    Alert.alert('Error', 'Please fill all fields'); return;
  }
  if (password !== confirmPassword) {
    console.log('family.tsx: Validation FAILED - Passwords do not match');
    Alert.alert('Error', 'Passwords do not match'); return;
  }
  if (password.length < 6) {
    console.log('family.tsx: Validation FAILED - Password too short');
    Alert.alert('Error', 'Password must be at least 6 characters'); return;
  }

  console.log('family.tsx: All validations passed. Setting loading = true...');
  setLoading(true);
  try {
    console.log('family.tsx: calling registerUser API...');
    const result = await registerUser(fullName, email, password, 'family', { patientEmail });
    console.log('family.tsx: registration result:', JSON.stringify(result));
    
    if (result.success) {
      console.log('family.tsx: Success! Saving tokens...');
      // ✅ Success - Save auth data
      const { accessToken, refreshToken, user } = result.data;
      
      await storage.setItem('accessToken', accessToken);
      await storage.setItem('refreshToken', refreshToken);
      await storage.setItem('userRole', user.role);
      await storage.setItem('userData', JSON.stringify(user));

      console.log('family.tsx: Data saved. Navigating to /family...');
      if (Platform.OS === 'web') {
        window.location.href = '/family';
      } else {
        router.replace('/family');
      }
    } else {
      console.log('family.tsx: Registration failed:', result.message);
      Alert.alert('Registration Failed', result.message || 'Could not complete registration.');
    }
  } catch (error) {
    console.error('Registration error:', error);
    Alert.alert('Error', 'Cannot connect to server.');
  } finally {
    setLoading(false);
  }
};
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ padding: 24, paddingTop: 48 }}
    >
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 24 }}>
        <Text style={{ color: '#6b7280', fontSize: 16 }}>← Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1f2937', marginBottom: 4 }}>
        Family Registration
      </Text>
      <Text style={{ color: '#6b7280', marginBottom: 32 }}>
        Stay connected with your loved ones
      </Text>

      {/* Fields */}
      {[
        { label: 'Full Name', placeholder: 'Enter your full name', value: fullName, setter: setFullName, secure: false, keyboard: 'default' },
        { label: 'Email Address', placeholder: 'Enter your email', value: email, setter: setEmail, secure: false, keyboard: 'email-address' },
        { label: "Patient's Email Address", placeholder: "Enter the patient's login email", value: patientEmail, setter: setPatientEmail, secure: false, keyboard: 'email-address' },
        { label: 'Password', placeholder: 'Create a password', value: password, setter: setPassword, secure: true, keyboard: 'default' },
        { label: 'Confirm Password', placeholder: 'Confirm your password', value: confirmPassword, setter: setConfirmPassword, secure: true, keyboard: 'default' },
      ].map((field) => (
        <View key={field.label}>
          <Text style={{ fontWeight: '600', color: '#374151', marginBottom: 8 }}>
            {field.label}
          </Text>
          <TextInput
            style={{
              borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
              paddingHorizontal: 16, paddingVertical: 12,
              fontSize: 16, marginBottom: 16, backgroundColor: '#f9fafb',
            }}
            placeholder={field.placeholder}
            value={field.value}
            onChangeText={field.setter}
            secureTextEntry={field.secure}
            keyboardType={field.keyboard as any}
            autoCapitalize="none"
          />
        </View>
      ))}

      {/* Register Button */}
      <TouchableOpacity
        onPress={handleRegister}
        disabled={loading}
        style={{
          backgroundColor: '#2563eb', paddingVertical: 16,
          borderRadius: 12, alignItems: 'center',
          marginTop: 8, marginBottom: 16,
        }}
      >
        {loading
          ? <ActivityIndicator color="white" />
          : <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Register</Text>
        }
      </TouchableOpacity>

      {/* Login Link */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280' }}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/auth/login')}>
          <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>Login</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}