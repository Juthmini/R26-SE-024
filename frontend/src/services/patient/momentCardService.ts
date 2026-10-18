import { authFetch } from '../../api/authApi';
import { EmojiReaction, FamilyEvent } from '../../types/family.types';

// backend documents use Mongo's _id — map every raw event to the shape
// FamilyEvent actually declares (id, not _id). Without this, event.id is
// undefined everywhere a screen reads it: reaction submissions would POST
// to "/patient/events/undefined/reaction", and the notification scheduler
// would build a broken identifier. Same fix as calendarService.ts's
// mapEvent, duplicated here since this is the patient-side service file.
const mapEvent = (e: any): FamilyEvent => ({
  id: e._id,
  title: e.title,
  eventType: e.eventType,
  personName: e.personName,
  relation: e.relation,
  eventDate: e.eventDate,
  eventTime: e.eventTime,
  scheduledAt: e.scheduledAt || null,
  note: e.note,
  photoUrl: e.photoUrl,
  sensitive: e.sensitive,
  cardText: e.cardText,
  cardTextSource: e.cardTextSource,
  theme: e.theme,
  status: e.status,
  createdAt: e.createdAt,
});

// fetches events due now, including anything missed, not yet reacted to
export const getDueEvents = async (): Promise<FamilyEvent[]> => {
  try {
    const data = await authFetch('/patient/events/due');
    return data?.success ? data.events.map(mapEvent) : [];
  } catch (error: any) {
    console.error('Fetch due events error:', error.message);
    return [];
  }
};

// every not-yet-completed event, no date ceiling — used to pre-schedule
// local reminders for events that aren't due yet
export const getUpcomingEvents = async (): Promise<FamilyEvent[]> => {
  try {
    const data = await authFetch('/patient/events/upcoming');
    return data?.success ? data.events.map(mapEvent) : [];
  } catch (error: any) {
    console.error('Fetch upcoming events error:', error.message);
    return [];
  }
};

// whether this patient's account currently allows a video-wish option —
// a family-controlled setting, read-only from the patient side
export const getEventSettings = async (): Promise<{ allowVideoReactions: boolean }> => {
  try {
    const data = await authFetch('/patient/events/settings');
    return data?.success ? data.settings : { allowVideoReactions: false };
  } catch (error: any) {
    console.error('Fetch event settings error:', error.message);
    return { allowVideoReactions: false };
  }
};

export const submitEmojiReaction = async (eventId: string, emoji: EmojiReaction): Promise<boolean> => {
  try {
    const data = await authFetch(`/patient/events/${eventId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ type: 'emoji', emoji }),
    });
    return !!data?.success;
  } catch (error: any) {
    console.error('Submit emoji reaction error:', error.message);
    return false;
  }
};

export const submitSkip = async (eventId: string): Promise<boolean> => {
  try {
    const data = await authFetch(`/patient/events/${eventId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ type: 'skipped' }),
    });
    return !!data?.success;
  } catch (error: any) {
    console.error('Submit skip error:', error.message);
    return false;
  }
};

export const submitVoiceReaction = async (
  eventId: string,
  audioBase64: string,
  durationSeconds: number
): Promise<boolean> => {
  try {
    const data = await authFetch(`/patient/events/${eventId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ type: 'voice', audioBase64, durationSeconds }),
    });
    return !!data?.success;
  } catch (error: any) {
    console.error('Submit voice reaction error:', error.message);
    return false;
  }
};

export const submitVideoReaction = async (
  eventId: string,
  videoBase64: string,
  durationSeconds: number
): Promise<boolean> => {
  try {
    const data = await authFetch(`/patient/events/${eventId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ type: 'video', videoBase64, durationSeconds }),
    });
    return !!data?.success;
  } catch (error: any) {
    console.error('Submit video reaction error:', error.message);
    return false;
  }
};
