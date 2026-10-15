// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { Platform } from 'react-native';

// // ✅ Works for both web and mobile
// const BASE_URL = 'http://192.168.1.6:5000/api';

// const storage = {
// getItem: async (key: string): Promise<string | null> => {
//   try {
//     if (Platform.OS === 'web') {
//       const value = window.localStorage.getItem(key);
//       console.log(`storage.getItem(${key}):`, value ? 'found' : 'null');
//       return value;
//     }
//     return await AsyncStorage.getItem(key);
//   } catch (e) {
//     console.log('storage.getItem error:', e);
//     return null;
//   }
// },
//   setItem: async (key: string, value: string): Promise<void> => {
//     try {
//       if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
//       await AsyncStorage.setItem(key, value);
//     } catch { }
//   },
//   multiRemove: async (keys: string[]): Promise<void> => {
//     try {
//       if (Platform.OS === 'web') { keys.forEach(k => localStorage.removeItem(k)); return; }
//       await AsyncStorage.multiRemove(keys);
//     } catch { }
//   },
// };

// export const registerUser = async (
//   fullName: string,
//   email: string,
//   password: string,
//   role: 'patient' | 'caregiver' | 'family'
// ) => {
//   try {
//     const response = await fetch(`${BASE_URL}/auth/register`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ fullName, email, password, role }),
//     });
//     return await response.json();
//   } catch (error) {
//     return { success: false, message: 'Cannot connect to server.' };
//   }
// };

// export const loginUser = async (email: string, password: string) => {
//   try {
//     const response = await fetch(`${BASE_URL}/auth/login`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ email, password }),
//     });
//     const data = await response.json();

//     if (data.success) {
//       await storage.setItem('accessToken', data.data.accessToken);
//       await storage.setItem('refreshToken', data.data.refreshToken);
//       await storage.setItem('userRole', data.data.user.role);
//       await storage.setItem('userData', JSON.stringify(data.data.user));
//     }
//     return data;
//   } catch (error) {
//     return { success: false, message: 'Cannot connect to server.' };
//   }
// };

// export const getAccessToken = async (): Promise<string | null> => {
//   return await storage.getItem('accessToken');
// };

// export const getStoredUser = async () => {
//   try {
//     const userData = await storage.getItem('userData');
//     return userData ? JSON.parse(userData) : null;
//   } catch {
//     return null;
//   }
// };

// export const getStoredRole = async (): Promise<string | null> => {
//   return await storage.getItem('userRole');
// };
// export const authFetch = async (endpoint: string, options: RequestInit = {}) => {
//   try {
//     const token = await getAccessToken();
//     console.log('authFetch token:', token ? 'exists' : 'NULL'); // ← ADD THIS

//     const response = await fetch(`${BASE_URL}${endpoint}`, {
//       ...options,
//       headers: {
//         'Content-Type': 'application/json',
//         Authorization: `Bearer ${token}`,
//         ...options.headers,
//       },
//     });
//     return await response.json();
//   } catch (error) {
//     return { success: false, message: 'Cannot connect to server.' };
//   }
// };
// export const logoutUser = async () => {
//   try {
//     await authFetch('/auth/logout', { method: 'POST' });
//   } catch { }
//   await storage.multiRemove(['accessToken', 'refreshToken', 'userRole', 'userData']);
// };

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Platform } from "react-native";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

// ✅ Web-safe storage
export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      console.log('storage: getItem called for', key, 'Platform:', Platform.OS);
      if (Platform.OS === "web") {
        const val = window.localStorage.getItem(key);
        console.log('storage: getItem (web) for', key, 'returned', val);
        return val;
      }
      const val = await AsyncStorage.getItem(key);
      console.log('storage: getItem (native) for', key, 'returned', val);
      return val;
    } catch (e) {
      console.log('storage: getItem error', e);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      console.log('storage: setItem called for', key, 'Platform:', Platform.OS);
      if (Platform.OS === "web") {
        window.localStorage.setItem(key, value);
        console.log('storage: setItem (web) finished for', key);
        return;
      }
      await AsyncStorage.setItem(key, value);
      console.log('storage: setItem (native) finished for', key);
    } catch (e) {
      console.log('storage: setItem error', e);
    }
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        keys.forEach((k) => window.localStorage.removeItem(k));
        return;
      }
      await AsyncStorage.multiRemove(keys);
    } catch {}
  },
};

// ✅ Now accepts extraData for patient profile fields
export const registerUser = async (
  fullName: string,
  email: string,
  password: string,
  role: "patient" | "caregiver" | "family",
  extraData?: Record<string, any>,
) => {
  console.log('registerUser: calling fetch for', email);
  try {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password, role, ...extraData }),
    });
    console.log('registerUser: response status', response.status);
    const data = await response.json();
    console.log('registerUser: data received', JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('registerUser error:', error);
    return { success: false, message: "Cannot connect to server." };
  }
};

export const loginUser = async (email: string, password: string) => {
  try {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();

    if (data.success) {
      sessionEnding = false;
      const user = data.data.user ?? {};
      const userId = user._id ?? user.id;

      if (data.data.accessToken)
        await storage.setItem("accessToken", data.data.accessToken);
      if (data.data.refreshToken)
        await storage.setItem("refreshToken", data.data.refreshToken);
      if (user.role) await storage.setItem("userRole", user.role);
      await storage.setItem("userData", JSON.stringify(user));
      if (userId) await storage.setItem("caregiverId", String(userId));

      // Personal Vault / Find My Things / routines key off the separate
      // caregiver Patient record (see backend authController.js login) when
      // one exists. It MUST always be overwritten here: a patient without a
      // caregiver record used to keep the previous user's 'patient' entry and
      // saw that person's things, people and stories.
      if (data.data.linkedPatient) {
        await storage.setItem("patient", JSON.stringify(data.data.linkedPatient));
      } else if (user.role === "patient" && userId) {
        await storage.setItem("patient", JSON.stringify({
          id: String(userId),
          firstName: (user.fullName || "").split(" ")[0],
          selfRegistered: true,
        }));
      } else {
        await storage.multiRemove(["patient"]);
      }
    }
    return data;
  } catch (error) {
    return { success: false, message: "Cannot connect to server." };
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return await storage.getItem("accessToken");
};

export const getStoredUser = async () => {
  try {
    const userData = await storage.getItem("userData");
    return userData ? JSON.parse(userData) : null;
  } catch {
    return null;
  }
};

export const getStoredRole = async (): Promise<string | null> => {
  return await storage.getItem("userRole");
};

export const authFetch = async (
  endpoint: string,
  options: RequestInit = {},
) => {
  try {
    // ✅ Read token directly from storage
    let token: string | null = null;
    if (Platform.OS === "web") {
      token = window.localStorage.getItem("accessToken");
    } else {
      token = await AsyncStorage.getItem("accessToken");
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json();

    // ✅ Auto refresh if token expired
    if (
      !data.success &&
      data.message === "Token expired. Please login again."
    ) {
      const refreshToken =
        Platform.OS === "web"
          ? window.localStorage.getItem("refreshToken")
          : await AsyncStorage.getItem("refreshToken");

      if (refreshToken) {
        const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const refreshData = await refreshResponse.json();

        if (refreshData.success) {
          const newToken = refreshData.data.accessToken;
          await storage.setItem("accessToken", newToken);

          // ✅ Retry with new token
          const retryResponse = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newToken}`,
              ...options.headers,
            },
          });
          return await retryResponse.json();
        }
      }

      // No refresh token, or the server rejected it (expired after 7 days,
      // or replaced by a login on another device).
      return await endSession(endpoint);
    }

    // A token we sent was rejected outright - the saved session is unusable.
    if (
      token &&
      !data.success &&
      (data.message === "Invalid token." ||
        data.message === "User no longer exists or is deactivated.")
    ) {
      return await endSession(endpoint);
    }

    return data;
  } catch (error) {
    return { success: false, message: "Cannot connect to server." };
  }
};

const SESSION_KEYS = [
  "accessToken",
  "refreshToken",
  "userRole",
  "userData",
  "patient", // or the next person to log in on this phone inherits it
];

// Several requests usually fail together when a session dies; only the first
// one should navigate. Reset by loginUser().
let sessionEnding = false;

// Clear the dead session and send the user back to the login screen, so a
// restart doesn't reopen a dashboard whose every request fails.
const endSession = async (endpoint: string) => {
  await storage.multiRemove(SESSION_KEYS);
  // logoutUser() navigates by itself.
  if (!sessionEnding && endpoint !== "/auth/logout") {
    sessionEnding = true;
    try {
      router.replace("/auth/login");
    } catch {
      // Navigator not mounted yet - app/index.tsx shows the landing screen.
    }
  }
  return { success: false, message: "Session expired. Please login again." };
};

export const logoutUser = async () => {
  try {
    await authFetch("/auth/logout", { method: "POST" });
  } catch {}
  await storage.multiRemove(SESSION_KEYS);
};

export const getMe = async () => {
  return await authFetch("/auth/me", { method: "GET" });
};

// ✅ Update the logged-in patient's own registration details.
export const updateMe = async (update: Record<string, any>) => {
  const result = await authFetch("/auth/me", {
    method: "PUT",
    body: JSON.stringify(update),
  });

  // Keep the locally cached user in sync so the profile reflects edits.
  if (result?.success) {
    try {
      const stored = await getStoredUser();
      await storage.setItem(
        "userData",
        JSON.stringify({ ...(stored || {}), ...update }),
      );
    } catch {
      // Non-fatal — the server remains the source of truth.
    }
  }

  return result;
};

export const getMePhotos = async () => {
  return await authFetch("/auth/me/photos", { method: "GET" });
};

export const getPatientPhotos = async (patientId: string) => {
  return await authFetch(`/auth/patients/${patientId}/photos`, { method: "GET" });
};
