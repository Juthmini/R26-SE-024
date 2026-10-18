import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../src/constants/colors';
import {
  BestTimeResponse,
  createEvent,
  deleteEvent,
  EventInput,
  getBestTime,
  getEvents,
  getEventSettings,
  updateEvent,
  updateEventSettings,
} from '../../src/services/family/calendarService';
import { pickPhoto } from '../../src/services/family/storyService';
import { EventType, FamilyEvent } from '../../src/types/family.types';

const EVENT_TYPE_OPTIONS: { key: EventType; label: string }[] = [
  { key: 'birthday', label: 'Birthday' },
  { key: 'anniversary', label: 'Anniversary' },
  { key: 'festival', label: 'Festival' },
  { key: 'religious', label: 'Religious' },
  { key: 'other', label: 'Other' },
];

const eventTypeLabel = (key: string) =>
  EVENT_TYPE_OPTIONS.find((t) => t.key === key)?.label || key;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "15:00" -> "3:00 PM" — eventTime is stored 24-hour for real time-based
// due checks; this is purely for display
const formatTimeDisplay = (hhmm: string) => {
  const match = TIME_RE.exec(hhmm);
  if (!match) return hhmm;
  const hour = Number(match[1]);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${period}`;
};

const emptyForm = {
  title: '',
  eventType: 'birthday' as EventType,
  personName: '',
  relation: '',
  eventDate: '',
  eventTime: '',
  note: '',
  photoUrl: '',
  sensitive: false,
  useAiCardText: false,
};

export default function FamilyCalendarScreen() {
  const nav = useRouter();

  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState<any>(null);

  const [allowVideoReactions, setAllowVideoReactions] = useState(false);
  const [bestTime, setBestTime] = useState<BestTimeResponse | null>(null);

  const loadEvents = useCallback(() => {
    getEvents().then((items) => {
      setEvents(items);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadEvents();
    getEventSettings().then((s) => setAllowVideoReactions(s.allowVideoReactions));
    getBestTime().then(setBestTime);
  }, [loadEvents]);

  // keeps the list current without a manual pull-to-refresh: picks up a
  // patient's reaction or a newly-missed event whenever this screen is
  // reopened, plus a 60s poll while it stays open — same cadence the
  // patient side already uses, this is the "real-time-ish" ceiling without
  // push notifications (which need a dev build, out of reach here)
  useFocusEffect(
    useCallback(() => {
      loadEvents();
      const interval = setInterval(loadEvents, 60000);
      return () => clearInterval(interval);
    }, [loadEvents])
  );

  const toggleVideoSetting = async () => {
    const next = !allowVideoReactions;
    setAllowVideoReactions(next); // optimistic — matches up-front, no spinner needed for a single boolean
    const ok = await updateEventSettings({ allowVideoReactions: next });
    if (!ok) setAllowVideoReactions(!next); // revert on failure
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPhoto(null);
    setShowModal(true);
  };

  const openEditModal = (event: FamilyEvent) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      eventType: event.eventType,
      personName: event.personName,
      relation: event.relation,
      eventDate: event.eventDate ? event.eventDate.slice(0, 10) : '',
      eventTime: event.eventTime,
      note: event.note,
      photoUrl: event.photoUrl,
      sensitive: event.sensitive,
      useAiCardText: false,
    });
    setPhoto(event.photoUrl ? { uri: event.photoUrl } : null);
    setShowModal(true);
  };

  const handlePickPhoto = async () => {
    const asset = await pickPhoto();
    if (asset) setPhoto(asset);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Missing', 'Please give this event a title');
      return;
    }
    if (!DATE_RE.test(form.eventDate)) {
      Alert.alert('Invalid date', 'Please enter the date as YYYY-MM-DD');
      return;
    }
    if (!TIME_RE.test(form.eventTime)) {
      Alert.alert('Invalid time', 'Please enter the time as 24-hour HH:mm, e.g. 15:00 for 3:00 PM');
      return;
    }
    if (form.note.length > 200) {
      Alert.alert('Too long', 'Note must be 200 characters or fewer');
      return;
    }

    setSaving(true);
    try {
      const input: EventInput = {
        title: form.title.trim(),
        eventType: form.eventType,
        personName: form.personName.trim(),
        relation: form.relation.trim(),
        eventDate: form.eventDate,
        eventTime: form.eventTime.trim(),
        note: form.note.trim(),
        // Phase 1 photo upload for events reuses the same picker as Stories;
        // the photo itself is only persisted once a photo URL exists (edit
        // flow) — uploading a brand-new photo as part of this form is out of
        // scope for Phase 1, matching the spec's "optional photo" wording.
        photoUrl: photo?.uri && photo.uri.startsWith('http') ? photo.uri : form.photoUrl,
        sensitive: form.sensitive,
        useAiCardText: form.useAiCardText,
      };

      const result = editingId
        ? await updateEvent(editingId, input)
        : await createEvent(input);

      if (result.success) {
        setShowModal(false);
        loadEvents();
      } else {
        Alert.alert('Error', result.message || 'Could not save this event');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (event: FamilyEvent) => {
    Alert.alert(
      'Delete this event?',
      'This removes it and any reactions permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(event.id);
            const ok = await deleteEvent(event.id);
            if (ok) {
              setEvents((prev) => prev.filter((e) => e.id !== event.id));
            } else {
              Alert.alert('Error', 'Could not delete this event. Try again.');
            }
            setDeletingId(null);
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Header */}
        <View style={{ backgroundColor: Colors.white, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/family'))} style={{ marginBottom: 12 }}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary }}>Family Calendar</Text>
          <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 2 }}>Schedule a moment to share with them</Text>
        </View>

        {/* Add button */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openAddModal}
          style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 20, backgroundColor: Colors.accent, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }}
        >
          <Ionicons name="calendar" size={22} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Add Event</Text>
        </TouchableOpacity>

        {/* Best-time insight — real data only, honest "not enough data" fallback */}
        {bestTime && (
          <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.accent + '15', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.accent + '30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.accentSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                <Ionicons name="time" size={22} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.accent, marginBottom: 4 }}>Best Time to Share a Moment</Text>
                {bestTime.recommendation ? (
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                    They tend to respond most in {bestTime.recommendation.label} ({bestTime.recommendation.responseRate}% response rate over {bestTime.recommendation.total} moments).
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                    Still gathering data — a few more reactions across different times of day will unlock a suggestion.
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Event list */}
        <View style={{ marginHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>UPCOMING & PAST EVENTS</Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : events.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight }}>
              <Ionicons name="calendar-outline" size={26} color={Colors.textMuted} />
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8, textAlign: 'center' }}>
                No events yet — add one above.
              </Text>
            </View>
          ) : (
            events.map((event) => (
              <TouchableOpacity
                key={event.id}
                activeOpacity={0.85}
                onPress={() => nav.push(`/family/event/${event.id}`)}
                style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: Colors.borderLight }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  {event.photoUrl ? (
                    <Image source={{ uri: event.photoUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: Colors.accentSoft, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="calendar" size={26} color={Colors.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: Colors.accentSoft }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.accent }}>{eventTypeLabel(event.eventType)}</Text>
                      </View>
                      {event.sensitive && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: Colors.borderLight }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.textMuted }}>CALM</Text>
                        </View>
                      )}
                      {event.cardTextSource === 'ai' && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: Colors.purpleSoft }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.purple }}>AI-SUGGESTED</Text>
                        </View>
                      )}
                      {event.status === 'missed' && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: Colors.dangerSoft }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.danger }}>MISSED</Text>
                        </View>
                      )}
                      {event.status === 'completed' && (
                        <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                      )}
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 3 }}>{event.title}</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {formatDate(event.eventDate)}{event.eventTime ? ` · ${formatTimeDisplay(event.eventTime)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => openEditModal(event)} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(event)} disabled={deletingId === event.id} style={{ padding: 6 }}>
                    {deletingId === event.id ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

      </ScrollView>

      {/* ─── MODAL — Add/Edit Event ─── */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.textPrimary }}>
                {editingId ? 'Edit Event' : 'Add Event'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Photo picker (optional) */}
            <TouchableOpacity onPress={handlePickPhoto} style={{ marginBottom: 16 }}>
              {photo ? (
                <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 160, borderRadius: 16, borderWidth: 2, borderColor: Colors.accent }} resizeMode="cover" />
              ) : (
                <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.accent + '60', height: 140, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="image-outline" size={36} color={Colors.accent + '80'} />
                  <Text style={{ color: Colors.accent, fontWeight: '700', fontSize: 13, marginTop: 8 }}>Tap to add a photo (optional)</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Title */}
            <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Title</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white, marginBottom: 14 }}
              placeholder="e.g. Dilani's birthday"
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
            />

            {/* Event type */}
            <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Event Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setForm((f) => ({ ...f, eventType: opt.key }))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: form.eventType === opt.key ? Colors.accent : Colors.white,
                    borderWidth: 1, borderColor: form.eventType === opt.key ? Colors.accent : Colors.border,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: form.eventType === opt.key ? '#fff' : Colors.textMuted }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Person name + relation */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Person</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white }}
                  placeholder="e.g. Dilani"
                  value={form.personName}
                  onChangeText={(v) => setForm((f) => ({ ...f, personName: v }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Relation</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white }}
                  placeholder="e.g. daughter"
                  value={form.relation}
                  onChangeText={(v) => setForm((f) => ({ ...f, relation: v }))}
                />
              </View>
            </View>

            {/* Date + time */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Date</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white }}
                  placeholder="YYYY-MM-DD"
                  value={form.eventDate}
                  onChangeText={(v) => setForm((f) => ({ ...f, eventDate: v }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Time (24-hour)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white }}
                  placeholder="e.g. 15:00 for 3:00 PM"
                  value={form.eventTime}
                  onChangeText={(v) => setForm((f) => ({ ...f, eventTime: v }))}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            {/* Note */}
            <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 }}>Short Note (optional, 200 chars)</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white, minHeight: 70, marginBottom: 14 }}
              placeholder="Anything you'd like the card to mention"
              value={form.note}
              onChangeText={(v) => setForm((f) => ({ ...f, note: v.slice(0, 200) }))}
              multiline
              textAlignVertical="top"
            />

            {/* Sensitive switch (simple tap toggle, no extra dependency) */}
            <TouchableOpacity
              onPress={() => setForm((f) => ({ ...f, sensitive: !f.sensitive }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight }}
            >
              <Ionicons name={form.sensitive ? 'checkbox' : 'square-outline'} size={22} color={form.sensitive ? Colors.accent : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary }}>Sensitive date</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Shows a calm card and never asks for a wish</Text>
              </View>
            </TouchableOpacity>

            {/* AI card text — opt-in, default off; silently falls back to the
                plain template on any failure, so the "AI-suggested" pill only
                ever appears when it genuinely happened */}
            <TouchableOpacity
              onPress={() => setForm((f) => ({ ...f, useAiCardText: !f.useAiCardText }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight }}
            >
              <Ionicons name={form.useAiCardText ? 'checkbox' : 'square-outline'} size={22} color={form.useAiCardText ? Colors.purple : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary }}>Let AI polish the wording</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Best-effort only — falls back to the plain sentence if it's unavailable</Text>
              </View>
            </TouchableOpacity>

            {/* Video wishes — a patient-level setting, not per-event, so
                toggling it here calls the settings endpoint immediately
                rather than being bundled into this event's save */}
            <TouchableOpacity
              onPress={toggleVideoSetting}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: Colors.borderLight }}
            >
              <Ionicons name={allowVideoReactions ? 'checkbox' : 'square-outline'} size={22} color={allowVideoReactions ? Colors.success : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textPrimary }}>Allow video wishes</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Applies to this patient's account, not just this event</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{ backgroundColor: saving ? Colors.accent + '70' : Colors.accent, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                {editingId ? 'Save Changes' : 'Add Event'}
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
