
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect, authorize } = require('../../middleware/auth');

// Caregiver stress model (ml-service/caregiver). Set CAREGIVER_ML_URL when it runs elsewhere (e.g. Render).
const ML_URL = process.env.CAREGIVER_ML_URL || 'http://localhost:5001';

// ✅ POST /api/caregiver/insights/checkin
router.post('/checkin', protect, authorize('caregiver'), async (req, res) => {
  try {
    const formData = req.body;

    const mlResponse = await axios.post(`${ML_URL}/predict`, formData);
    const result = mlResponse.data;

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'ML model prediction failed',
      });
    }

    res.status(200).json({
      success: true,
      result: {
        stressLevel: result.stressLevel,
        stressScore: result.stressScore,
        confidence:  result.confidence,
        message:     result.message,
        tips:        result.tips,
        submittedAt: result.submittedAt,
      },
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'ML service not running. Start Flask API first.',
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET /api/caregiver/insights/latest - no ID needed
router.get('/latest', protect, authorize('caregiver'), async (req, res) => {
  try {
    // Return null for now - can store in DB later
    res.status(200).json({ success: false, result: null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;