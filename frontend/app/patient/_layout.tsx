import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { scheduleNightlyStory } from '../../src/services/memoryAI';

// Let Expo Router auto-discover the child routes ((tabs), cognitive/assessment,
// cognitive/games). Declaring them explicitly is unnecessary here and, when a
// declared name doesn't line up exactly with a real route, iOS native builds
// crash the navigator (web only warns) - bare auto-discovery avoids that.
export default function PatientLayout() {
  const router = useRouter();

  useEffect(() => {
    scheduleNightlyStory();
    let sub: { remove: () => void } | undefined;
    try {
      // Lazy require - see scheduleNightlyStory for why.
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string' && url.startsWith('/patient/')) router.push(url as any);
      });
    } catch {}
    return () => sub?.remove();
  }, [router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
