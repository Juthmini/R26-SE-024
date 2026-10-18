import { authFetch } from '../../api/authApi';
import { EventReaction, EventType, FamilyEvent } from '../../types/family.types';

export interface EventInput {
  title: string;
  eventType: EventType;
  personName?: string;
  relation?: string;
  eventDate: string;    // ISO date string
  eventTime?: string;
  note?: string;
  photoUrl?: string;
  sensitive?: boolean;
  useAiCardText?: boolean;
}

export interface EventSettings {
  allowVideoReactions: boolean;
}

export interface BestTimeBucket {
  bucket: string;
  label: string;
  total: number;
  responseRate: number;
}

export interface BestTimeResponse {
  success: boolean;
  totalReactions: number;
  recommendation: BestTimeBucket | null;
  ranked: BestTimeBucket[];
}

// backend documents use Mongo's _id — map every raw event to the shape
// FamilyEvent actually declares (id, not _id), otherwise event.id is
// undefined everywhere a screen reads it (navigation, keys, edit/delete)
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

// fetches every event the family has scheduled for their linked patient
export const getEvents = async (): Promise<FamilyEvent[]> => {
  try {
    const data = await authFetch('/family/events');
    return data?.success ? data.events.map(mapEvent) : [];
  } catch (error: any) {
    console.error('Fetch events error:', error.message);
    return [];
  }
};

export const createEvent = async (input: EventInput) => {
  try {
    return await authFetch('/family/events', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error: any) {
    console.error('Create event error:', error.message);
    return { success: false, message: error.message };
  }
};

export const updateEvent = async (eventId: string, input: Partial<EventInput>) => {
  try {
    return await authFetch(`/family/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  } catch (error: any) {
    console.error('Update event error:', error.message);
    return { success: false, message: error.message };
  }
};

export const deleteEvent = async (eventId: string): Promise<boolean> => {
  try {
    const data = await authFetch(`/family/events/${eventId}`, { method: 'DELETE' });
    return !!data?.success;
  } catch (error: any) {
    console.error('Delete event error:', error.message);
    return false;
  }
};

const mapReaction = (r: any): EventReaction => ({
  id: r._id,
  event: r.event,
  type: r.type,
  emoji: r.emoji,
  mediaUrl: r.mediaUrl,
  durationSeconds: r.durationSeconds,
  seenByFamilyAt: r.seenByFamilyAt,
  createdAt: r.createdAt,
});

// fetches the patient's reactions (emoji/voice/skip) for one event
export const getEventReactions = async (eventId: string): Promise<EventReaction[]> => {
  try {
    const data = await authFetch(`/family/events/${eventId}/reactions`);
    return data?.success ? data.reactions.map(mapReaction) : [];
  } catch (error: any) {
    console.error('Fetch event reactions error:', error.message);
    return [];
  }
};

export const markReactionSeen = async (eventId: string, reactionId: string): Promise<boolean> => {
  try {
    const data = await authFetch(`/family/events/${eventId}/reactions/${reactionId}/seen`, {
      method: 'PATCH',
    });
    return !!data?.success;
  } catch (error: any) {
    console.error('Mark reaction seen error:', error.message);
    return false;
  }
};

// patient-level setting (not per-event) controlling whether a video wish
// option is offered on the Moment Card — family-controlled, see plan notes
export const getEventSettings = async (): Promise<EventSettings> => {
  try {
    const data = await authFetch('/family/events/settings');
    return data?.success ? data.settings : { allowVideoReactions: false };
  } catch (error: any) {
    console.error('Fetch event settings error:', error.message);
    return { allowVideoReactions: false };
  }
};

export const updateEventSettings = async (settings: EventSettings): Promise<boolean> => {
  try {
    const data = await authFetch('/family/events/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return !!data?.success;
  } catch (error: any) {
    console.error('Update event settings error:', error.message);
    return false;
  }
};

// real data only — null until enough reactions exist to trust a time bucket
export const getBestTime = async (): Promise<BestTimeResponse> => {
  try {
    const data = await authFetch('/family/events/best-time');
    return data?.success
      ? data
      : { success: false, totalReactions: 0, recommendation: null, ranked: [] };
  } catch (error: any) {
    console.error('Fetch best-time error:', error.message);
    return { success: false, totalReactions: 0, recommendation: null, ranked: [] };
  }
};
