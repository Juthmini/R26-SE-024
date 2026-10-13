const Memory = require('../../models/family/FamilyMemory');
const Patient = require('../../models/caregiver/Patient');
const FamilyPatientProfile = require('../../models/family/FamilyPatientProfile');
const SessionOutcome = require('../../models/family/SessionOutcome');
const axios = require('axios');
const cloudinary = require('../../config/cloudinary');
const mongoose = require('mongoose');

// a category needs at least this many completed sessions before it's
// confident enough to recommend — avoids a single lucky/unlucky session
// driving a misleading suggestion
const MIN_SESSIONS_PER_CATEGORY = 2;

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

// --- CREATE memory + generate story ---
const createMemory = async (req, res) => {
  try {
    const { patientId, familyNote, imageBase64, category } = req.body;

    if (!patientId || !familyNote || !imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'patientId, familyNote and imageBase64 are required',
      });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // get the family-specific profile (spouse, children, hometown)
    // defaults to empty values if no profile exists yet
    let profile = await FamilyPatientProfile.findOne({ patientId });
    if (!profile) {
      profile = { spouse: '', children: [], hometown: '' };
    }

    // upload photo to cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${imageBase64}`,
      { folder: 'memocare/memories' }
    );

    // call AI service — Kaggle-hosted fine-tuned Llama-3 via localtunnel
    console.log('Calling AI service at:', AI_SERVICE_URL);
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/generate`,
      {
        photo_desc: 'a special family memory',
        family_note: familyNote,
        patient_name: patient.name,
        hometown: profile.hometown || '',
        tone: 'calm',
        length: 'short',
      },
      {
        timeout: 60000,
        headers: { 'bypass-tunnel-reminder': 'true' },
      }
    );

    if (!aiResponse.data.success) {
      return res.status(500).json({
        success: false,
        message: 'AI story generation failed',
      });
    }

    const memory = await Memory.create({
      patientId,
      uploadedBy: req.user ? req.user._id : new mongoose.Types.ObjectId(),
      photoUrl: uploadResult.secure_url,
      familyNote,
      category: category || 'other',
      aiPhotoDescription: 'a special family memory',
      generatedStory: aiResponse.data.story,
    });

    res.status(201).json({ success: true, memory });
  } catch (error) {
    console.error('CREATE MEMORY ERROR:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET all memories for a patient ---
const getMemoriesByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const memories = await Memory.find({ patientId })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, memories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET adaptive story recommendation — ranks memory categories by their
//     average real mood-shift across past listening sessions, so the family
//     knows what kind of story tends to work best ---
const getCategoryRecommendation = async (req, res) => {
  try {
    const { patientId } = req.params;

    const outcomes = await SessionOutcome.find({ patientId })
      .populate('memoryId', 'category');

    const byCategory = {};
    for (const outcome of outcomes) {
      const category = outcome.memoryId?.category || 'other';
      if (!byCategory[category]) byCategory[category] = { sum: 0, count: 0 };
      byCategory[category].sum += outcome.moodShiftPercent || 0;
      byCategory[category].count += 1;
    }

    const ranked = Object.entries(byCategory)
      .map(([category, { sum, count }]) => ({
        category,
        avgMoodShiftPercent: Math.round((sum / count) * 10) / 10,
        sessionCount: count,
      }))
      .filter((entry) => entry.sessionCount >= MIN_SESSIONS_PER_CATEGORY)
      .sort((a, b) => b.avgMoodShiftPercent - a.avgMoodShiftPercent);

    res.status(200).json({
      success: true,
      totalSessions: outcomes.length,
      recommendation: ranked[0] || null,
      ranked,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET single memory ---
const getMemoryById = async (req, res) => {
  try {
    const memory = await Memory.findById(req.params.id);

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found',
      });
    }

    res.status(200).json({ success: true, memory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- UPDATE play count ---
const incrementPlayCount = async (req, res) => {
  try {
    const memory = await Memory.findByIdAndUpdate(
      req.params.id,
      { $inc: { playCount: 1 } },
      { new: true }
    );

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found',
      });
    }

    res.status(200).json({ success: true, memory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- DELETE memory ---
const deleteMemory = async (req, res) => {
  try {
    const memory = await Memory.findByIdAndDelete(req.params.id);

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found',
      });
    }

    res.status(200).json({ success: true, message: 'Memory deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createMemory,
  getMemoriesByPatient,
  getMemoryById,
  getCategoryRecommendation,
  incrementPlayCount,
  deleteMemory,
};