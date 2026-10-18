const axios = require('axios');
const FamilyEvent = require('../../models/family/FamilyEvent');
const EventReaction = require('../../models/family/EventReaction');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const MIN_REACTIONS_PER_BUCKET = 3;

// plain-template sentence — no AI call, only data the family entered
const buildCardText = ({ eventType, personName, relation, title }) => {
  const who = personName
    ? `${relation ? relation + ' ' : ''}${personName}`
    : (relation || 'someone special');

  if (eventType === 'birthday') return `Today is ${who}'s birthday.`;
  if (eventType === 'anniversary') return `Today is ${who}'s anniversary.`;
  if (title) return title;
  return `Today is a special day for ${who}.`;
};

// combines eventDate's calendar day with eventTime's "HH:mm" into one real
// instant to compare "due" checks against — returns null if eventTime
// doesn't parse (e.g. a pre-existing freeform value), so callers can
// safely fall back to "due immediately" rather than crash
const computeScheduledAt = (eventDate, eventTime) => {
  if (!eventDate || !eventTime) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(eventTime);
  if (!match) return null;
  const date = new Date(eventDate);
  if (isNaN(date.getTime())) return null;
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
};

// flips any event whose calendar day has fully passed (not just its time —
// a 9am event isn't "missed" at 10am the same day) and is still
// scheduled/shown over to 'missed'. Lazy, on-read — no cron library exists
// in this backend, confirmed, so this runs at the top of every read instead
// of needing a background job.
const markMissedEvents = async (patientId) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  await FamilyEvent.updateMany(
    {
      patientId,
      status: { $in: ['scheduled', 'shown'] },
      eventDate: { $lt: startOfToday },
    },
    { $set: { status: 'missed' } }
  );
};

// best-effort only — the template cardText is always the safe baseline.
// Any failure here (timeout, tunnel down, no credits) is swallowed and the
// caller keeps using the template; never let this block or fail the request.
const tryAiCardText = async ({ title, personName, relation, note }) => {
  if (!AI_SERVICE_URL) return null;
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/generate`,
      {
        photo_desc: title,
        family_note: note || '',
        patient_name: personName || relation || 'them',
        tone: 'warm',
        length: 'short',
      },
      { timeout: 8000, headers: { 'bypass-tunnel-reminder': 'true' } }
    );
    if (response.data && response.data.success && response.data.story) {
      return response.data.story;
    }
    return null;
  } catch (error) {
    console.warn('AI card text enhancement failed, keeping template:', error.message);
    return null;
  }
};

// --- CREATE event ---
const createEvent = async (req, res) => {
  try {
    const {
      title, eventType, personName, relation, eventDate,
      eventTime, timezone, note, photoUrl, sensitive, useAiCardText,
    } = req.body;
    const patientId = req.linkedPatientId;

    if (!title || !eventDate) {
      return res.status(400).json({
        success: false,
        message: 'title and eventDate are required',
      });
    }
    if (note && note.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'note must be 200 characters or fewer',
      });
    }

    const isSensitive = !!sensitive;
    let cardText = buildCardText({ eventType, personName, relation, title });
    let cardTextSource = 'template';

    if (useAiCardText) {
      const aiText = await tryAiCardText({ title, personName, relation, note });
      if (aiText) {
        cardText = aiText;
        cardTextSource = 'ai';
      }
    }

    const theme = isSensitive ? 'calm' : (eventType || 'other');

    const event = await FamilyEvent.create({
      patientId,
      createdBy: req.user.userId,
      title,
      eventType: eventType || 'other',
      personName: personName || '',
      relation: relation || '',
      eventDate,
      eventTime: eventTime || '',
      scheduledAt: computeScheduledAt(eventDate, eventTime),
      timezone: timezone || 'Asia/Colombo',
      note: note || '',
      photoUrl: photoUrl || '',
      sensitive: isSensitive,
      cardText,
      cardTextSource,
      theme,
    });

    res.status(201).json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET all events for the linked patient ---
const getEvents = async (req, res) => {
  try {
    await markMissedEvents(req.linkedPatientId);

    const events = await FamilyEvent.find({ patientId: req.linkedPatientId })
      .sort({ eventDate: 1 });

    res.status(200).json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- UPDATE event ---
const updateEvent = async (req, res) => {
  try {
    const existing = await FamilyEvent.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (existing.patientId.toString() !== req.linkedPatientId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this event' });
    }

    const {
      title, eventType, personName, relation, eventDate,
      eventTime, timezone, note, photoUrl, sensitive, status, useAiCardText,
    } = req.body;

    if (note !== undefined && note.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'note must be 200 characters or fewer',
      });
    }

    if (title !== undefined) existing.title = title;
    if (eventType !== undefined) existing.eventType = eventType;
    if (personName !== undefined) existing.personName = personName;
    if (relation !== undefined) existing.relation = relation;
    if (eventDate !== undefined) existing.eventDate = eventDate;
    if (eventTime !== undefined) existing.eventTime = eventTime;
    if (timezone !== undefined) existing.timezone = timezone;
    if (note !== undefined) existing.note = note;
    if (photoUrl !== undefined) existing.photoUrl = photoUrl;
    if (sensitive !== undefined) existing.sensitive = !!sensitive;
    // editing a missed/completed event (e.g. rescheduling it) should bring
    // it back to life rather than leaving it stuck — unless the caller
    // explicitly set a status themselves
    if (status !== undefined) {
      existing.status = status;
    } else if ((eventDate !== undefined || eventTime !== undefined) && existing.status === 'missed') {
      existing.status = 'scheduled';
    }

    if (eventDate !== undefined || eventTime !== undefined) {
      existing.scheduledAt = computeScheduledAt(existing.eventDate, existing.eventTime);
    }

    // keep cardText/theme in sync with whatever changed
    existing.cardText = buildCardText({
      eventType: existing.eventType,
      personName: existing.personName,
      relation: existing.relation,
      title: existing.title,
    });
    existing.cardTextSource = 'template';
    existing.theme = existing.sensitive ? 'calm' : existing.eventType;

    if (useAiCardText) {
      const aiText = await tryAiCardText({
        title: existing.title,
        personName: existing.personName,
        relation: existing.relation,
        note: existing.note,
      });
      if (aiText) {
        existing.cardText = aiText;
        existing.cardTextSource = 'ai';
      }
    }

    await existing.save();

    res.status(200).json({ success: true, event: existing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- DELETE event ---
const deleteEvent = async (req, res) => {
  try {
    const existing = await FamilyEvent.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (existing.patientId.toString() !== req.linkedPatientId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this event' });
    }

    await FamilyEvent.findByIdAndDelete(req.params.id);
    await EventReaction.deleteMany({ event: req.params.id });

    res.status(200).json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET reactions for one event ---
const getReactions = async (req, res) => {
  try {
    const event = await FamilyEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.patientId.toString() !== req.linkedPatientId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this event' });
    }

    const reactions = await EventReaction.find({ event: req.params.id }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, reactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- PATCH mark a reaction as seen by the family ---
const markReactionSeen = async (req, res) => {
  try {
    const reaction = await EventReaction.findById(req.params.reactionId);
    if (!reaction || reaction.event.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Reaction not found' });
    }
    if (reaction.patientId.toString() !== req.linkedPatientId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this reaction' });
    }

    reaction.seenByFamilyAt = new Date();
    await reaction.save();

    res.status(200).json({ success: true, reaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// hour-of-day buckets a reaction's createdAt falls into — coarse on purpose,
// a single lucky/unlucky hour shouldn't drive the recommendation
const BUCKETS = [
  { key: 'morning', label: 'the morning (6 AM–12 PM)', from: 6, to: 12 },
  { key: 'afternoon', label: 'the afternoon (12–5 PM)', from: 12, to: 17 },
  { key: 'evening', label: 'the evening (5–9 PM)', from: 17, to: 21 },
  { key: 'night', label: 'the night (9 PM–6 AM)', from: 21, to: 6 },
];

const bucketForHour = (hour) =>
  BUCKETS.find((b) => (b.from < b.to ? hour >= b.from && hour < b.to : hour >= b.from || hour < b.to));

// --- GET best time of day to show a Moment Card — real data only ---
const getBestTime = async (req, res) => {
  try {
    const reactions = await EventReaction.find({ patientId: req.linkedPatientId });

    const tally = {};
    for (const b of BUCKETS) tally[b.key] = { total: 0, responded: 0 };

    for (const reaction of reactions) {
      const bucket = bucketForHour(new Date(reaction.createdAt).getHours());
      if (!bucket) continue;
      tally[bucket.key].total += 1;
      if (reaction.type !== 'skipped') tally[bucket.key].responded += 1;
    }

    const ranked = BUCKETS
      .map((b) => ({
        bucket: b.key,
        label: b.label,
        total: tally[b.key].total,
        responseRate: tally[b.key].total ? Math.round((tally[b.key].responded / tally[b.key].total) * 100) : 0,
      }))
      .filter((entry) => entry.total >= MIN_REACTIONS_PER_BUCKET)
      .sort((a, b) => b.responseRate - a.responseRate);

    res.status(200).json({
      success: true,
      totalReactions: reactions.length,
      recommendation: ranked[0] || null,
      ranked,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  getReactions,
  markReactionSeen,
  getBestTime,
};
