import { getUpcomingEvents } from './momentCardService';

const IDENTIFIER_PREFIX = 'family-calendar-';

// Keeps this device's locally-scheduled reminders in sync with the real
// upcoming-events list: cancels any reminder for an event that's gone
// (edited/deleted/completed) and schedules one for anything new. These are
// LOCAL notifications (expo-notifications' one-off DATE trigger), not real
// remote push — they still fire even with the app fully closed, with no dev
// build required, matching the existing scheduleNightlyStory() precedent in
// src/services/memoryAI.ts. Lazy-required (never a static import) so this
// never trips expo-notifications' push-token auto-registration in Expo Go.
export async function syncMomentCardReminders() {
  try {
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;

    const upcoming = await getUpcomingEvents();
    const upcomingIds = new Set(upcoming.map((e) => e.id));

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const id = notif.identifier;
      if (!id.startsWith(IDENTIFIER_PREFIX)) continue;
      const eventId = id.slice(IDENTIFIER_PREFIX.length);
      if (!upcomingIds.has(eventId)) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      }
    }

    for (const event of upcoming) {
      const identifier = `${IDENTIFIER_PREFIX}${event.id}`;
      // cancel-then-recreate so edits (date changes) are always reflected,
      // same idempotent approach scheduleNightlyStory() uses
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

      // scheduledAt is the real combined date+time the backend computed from
      // eventDate + eventTime; pre-existing events saved before that field
      // existed fall back to 9 AM on the event's date, same as before
      const fireDate = event.scheduledAt ? new Date(event.scheduledAt) : new Date(event.eventDate);
      if (!event.scheduledAt) fireDate.setHours(9, 0, 0, 0);
      if (fireDate.getTime() < Date.now()) continue; // don't schedule for the past

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: '📅 A Moment for Today',
          body: event.cardText,
          data: { url: '/patient/memory' },
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
    }
  } catch {
    // reminders are a nice-to-have; the Moment Card still works without them
  }
}
