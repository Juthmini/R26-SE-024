import { registerUser } from "@/src/api/authApi";
import {
    FamilyMember,
    FoodItem,
    Step1Data,
    Step2Data,
    Step3Data,
} from "@/src/types/PatientRegisterTypes";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Step1BasicInfo from "./step1";
import Step2PersonalMemories from "./step2";
import Step3Preferences from "./step3";

export default function PatientRegistration() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const [step1Data, setStep1Data] = useState<Step1Data>({
    fullName: "",
    email: "",
    password: "",
    age: "",
    gender: "",
  });

  const [step2Data, setStep2Data] = useState<Step2Data>({
    familyMembers: [] as FamilyMember[],
    lifeEvents: [],
    hometown: "",
    countriesLived: [],
    occupations: [],
  });

  const [step3Data, setStep3Data] = useState<Step3Data>({
    favoritePhotos: [] as string[],
    favoritePlaces: [] as string[],
    festivalsCelebrated: [] as string[],
    foodsPreferred: [] as FoodItem[],
    preferredSports: [] as string[],
    languagesPreferred: "",
  });

  // ── Step 1 validation ──────────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    if (!step1Data.fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return false;
    }
    if (!step1Data.email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return false;
    }
    if (!step1Data.email.includes("@")) {
      Alert.alert("Error", "Please enter a valid email");
      return false;
    }
    if (!step1Data.password.trim()) {
      Alert.alert("Error", "Please enter a password");
      return false;
    }
    if (step1Data.password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return false;
    }
    if (!step1Data.age.trim()) {
      Alert.alert("Error", "Please enter your age");
      return false;
    }
    if (!step1Data.gender) {
      Alert.alert("Error", "Please select your gender");
      return false;
    }
    return true;
  };

  // ── Navigation ─────────────────────────────────────────────────────────
  const handleBackPress = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      router.back();
    }
  };

  const handleNextStep = () => {
    // Validate step 1 before proceeding
    if (currentStep === 1 && !validateStep1()) return;

    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  // ── Submit to backend ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await registerUser(
        step1Data.fullName,
        step1Data.email,
        step1Data.password,
        "patient",
        {
          // Step 1 extra
          age: Number(step1Data.age),
          gender: step1Data.gender,

          // Step 2
          familyMembers: step2Data.familyMembers,
          lifeEvents: step2Data.lifeEvents,
          hometown: step2Data.hometown,
          countriesLived: step2Data.countriesLived,
          occupations: step2Data.occupations,

          // Step 3
          favoritePhotos: step3Data.favoritePhotos,
          favoritePlaces: step3Data.favoritePlaces,
          festivalsCelebrated: step3Data.festivalsCelebrated,
          foodsPreferred: step3Data.foodsPreferred,
          preferredSports: step3Data.preferredSports,
        },
      );

      if (result.success) {
        Alert.alert(
          "Success! 🎉",
          "Patient profile created successfully! Redirecting to login...",
        );
        setTimeout(() => {
          router.replace("/auth/login");
        }, 1500);
      } else {
        // ✅ Show exact error from backend
        console.log("Registration failed:", result);
        Alert.alert(
          "Registration Failed",
          result.message || "Please try again.",
        );
      }
    } catch (error) {
      console.log("Registration error:", error);
      Alert.alert("Error", "Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Progress bar ───────────────────────────────────────────────────────
  const renderProgressBar = () => (
    <View className="px-6 py-4">
      <View className="flex-row gap-2 mb-2">
        {[1, 2, 3].map((step) => (
          <View key={step} className="flex-1">
            <View
              className={`h-1 rounded-full ${
                currentStep >= step ? "bg-blue-600" : "bg-gray-300"
              }`}
            />
          </View>
        ))}
      </View>
      <Text className="text-sm text-gray-600 text-center">
        Step {currentStep} of 3 -{" "}
        {currentStep === 1
          ? "Basic Info"
          : currentStep === 2
            ? "Personal Memories"
            : "Preferences"}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 bg-gray-50"
        scrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-6 py-4 flex-row items-center gap-4">
          <TouchableOpacity
            onPress={handleBackPress}
            className="w-10 h-10 rounded-full bg-white justify-center items-center shadow-sm"
          >
            <Ionicons name="chevron-back" size={24} color="#1e40af" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-800">
            Patient Profile
          </Text>
        </View>

        {/* Progress Bar */}
        {renderProgressBar()}

        {/* Form Content */}
        <View className="px-6 pb-6">
          {currentStep === 1 && (
            <Step1BasicInfo
              data={step1Data}
              onChange={(partial) =>
                setStep1Data((prev) => ({ ...prev, ...partial }))
              }
            />
          )}
          {currentStep === 2 && (
            <Step2PersonalMemories
              data={step2Data}
              onChange={(partial) =>
                setStep2Data((prev) => ({ ...prev, ...partial }))
              }
            />
          )}
          {currentStep === 3 && (
            <Step3Preferences
              data={step3Data}
              showLanguagesPreferred={false}
              onChange={(partial) =>
                setStep3Data((prev) => ({ ...prev, ...partial }))
              }
            />
          )}
        </View>

        {/* Navigation Buttons */}
        <View className="px-6 pb-6 gap-3 flex-row">
          {currentStep > 1 && (
            <TouchableOpacity
              onPress={() => setCurrentStep(currentStep - 1)}
              className="flex-1 bg-gray-300 rounded-lg py-4 items-center"
              disabled={loading}
            >
              <Text className="text-gray-700 font-semibold">Previous</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleNextStep}
            disabled={loading}
            className="flex-1 bg-blue-600 rounded-lg py-4 items-center"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold">
                {currentStep === 3 ? "Complete Registration" : "Next"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
