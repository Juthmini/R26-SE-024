const EventSettings = require('../../models/family/EventSettings');

// --- GET settings for the linked patient (defaults when none exist yet) ---
const getEventSettings = async (req, res) => {
  try {
    const settings = await EventSettings.findOne({ patientId: req.linkedPatientId });
    res.status(200).json({
      success: true,
      settings: {
        allowVideoReactions: settings ? settings.allowVideoReactions : false,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- PUT upsert settings for the linked patient ---
const updateEventSettings = async (req, res) => {
  try {
    const { allowVideoReactions } = req.body;

    const settings = await EventSettings.findOneAndUpdate(
      { patientId: req.linkedPatientId },
      { allowVideoReactions: !!allowVideoReactions },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      settings: { allowVideoReactions: settings.allowVideoReactions },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getEventSettings, updateEventSettings };
