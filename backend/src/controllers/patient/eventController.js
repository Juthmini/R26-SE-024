const FamilyEvent = require('../../models/family/FamilyEvent');
const EventReaction = require('../../models/family/EventReaction');
const EventSettings = require('../../models/family/EventSettings');
const cloudinary = require('../../config/cloudinary');

const MAX_VOICE_SECONDS = 15;
// generous cap for a 15s clip's base64 text (~6MB decoded) — defensive only,
// express.json({ limit: "25mb" }) already bounds the request body itself
const MAX_AUDIO_BASE64_LENGTH = 8 * 1024 * 1024;
// video is heavier than audio at the same duration — allow more headroom
const MAX_VIDEO_BASE64_LENGTH = 20 * 1024 * 1024;

// same lazy transition as the family side's eventController.js — flips any
// event whose calendar day has fully passed and is still scheduled/shown
// over to 'missed'. Duplicated rather than shared, same reasoning as the
// rest of this file's split from the family controller: an edit here can
// never affect the already-verified family pipeline.
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

// --- GET events due now, including anything missed — not yet completed ---
const getDueEvents = async (req, res) => {
  try {
    const patientId = req.resolvedPatientId;
    await markMissedEvents(patientId);

    const now = new Date();

    const events = await FamilyEvent.find({
      patientId,
      status: { $in: ['scheduled', 'shown', 'missed'] },
      $or: [
        { scheduledAt: { $lte: now } },
        { scheduledAt: null },
      ],
    }).sort({ scheduledAt: 1 });

    res.status(200).json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- POST a reaction to one event: emoji, voice, or skip ---
const submitReaction = async (req, res) => {
  try {
    const patientId = req.resolvedPatientId;
    const { type, emoji, audioBase64, durationSeconds } = req.body;

    if (!['emoji', 'voice', 'video', 'skipped'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid reaction type' });
    }

    if (type === 'video') {
      const settings = await EventSettings.findOne({ patientId });
      if (!settings || !settings.allowVideoReactions) {
        return res.status(403).json({ success: false, message: "Video reactions aren't enabled for this account." });
      }
    }

    const event = await FamilyEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.patientId.toString() !== patientId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to react to this event' });
    }

    if (type === 'emoji' && !['happy', 'calm', 'sad'].includes(emoji)) {
      return res.status(400).json({ success: false, message: 'Invalid emoji value' });
    }

    let mediaUrl = '';
    let safeDuration = 0;

    if (type === 'voice') {
      if (!audioBase64) {
        return res.status(400).json({ success: false, message: 'audioBase64 is required for a voice reaction' });
      }
      if (durationSeconds && durationSeconds > MAX_VOICE_SECONDS) {
        return res.status(400).json({ success: false, message: `Voice wishes can be at most ${MAX_VOICE_SECONDS} seconds` });
      }
      if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
        return res.status(400).json({ success: false, message: 'Audio file is too large' });
      }

      const uploadResult = await cloudinary.uploader.upload(
        `data:audio/m4a;base64,${audioBase64}`,
        { folder: 'memocare/event-reactions', resource_type: 'video' }
      );
      mediaUrl = uploadResult.secure_url;
      safeDuration = Math.min(durationSeconds || 0, MAX_VOICE_SECONDS);
    }

    if (type === 'video') {
      const { videoBase64 } = req.body;
      if (!videoBase64) {
        return res.status(400).json({ success: false, message: 'videoBase64 is required for a video reaction' });
      }
      if (durationSeconds && durationSeconds > MAX_VOICE_SECONDS) {
        return res.status(400).json({ success: false, message: `Video wishes can be at most ${MAX_VOICE_SECONDS} seconds` });
      }
      if (videoBase64.length > MAX_VIDEO_BASE64_LENGTH) {
        return res.status(400).json({ success: false, message: 'Video file is too large' });
      }

      const uploadResult = await cloudinary.uploader.upload(
        `data:video/mp4;base64,${videoBase64}`,
        { folder: 'memocare/event-reactions', resource_type: 'video' }
      );
      mediaUrl = uploadResult.secure_url;
      safeDuration = Math.min(durationSeconds || 0, MAX_VOICE_SECONDS);
    }

    const reaction = await EventReaction.create({
      event: event._id,
      patientId,
      type,
      emoji: type === 'emoji' ? emoji : null,
      mediaUrl,
      durationSeconds: safeDuration,
    });

    event.status = 'completed';
    await event.save();

    res.status(201).json({ success: true, reaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET whether this patient's account currently allows video wishes —
//     read-only from the patient side; only the family side can change it ---
const getSettings = async (req, res) => {
  try {
    const settings = await EventSettings.findOne({ patientId: req.resolvedPatientId });
    res.status(200).json({
      success: true,
      settings: { allowVideoReactions: settings ? settings.allowVideoReactions : false },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET every not-yet-completed event, no date ceiling — the full future
//     list the device needs to pre-schedule local reminders for ---
const getUpcomingEvents = async (req, res) => {
  try {
    const patientId = req.resolvedPatientId;
    await markMissedEvents(patientId);

    const events = await FamilyEvent.find({
      patientId,
      status: { $ne: 'completed' },
    }).sort({ eventDate: 1 });

    res.status(200).json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDueEvents,
  getUpcomingEvents,
  getSettings,
  submitReaction,
};
