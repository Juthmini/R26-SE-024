// backend/src/routes/caregiver/llmRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { personalizeRecommendations } = require('../../services/caregiver/llmService');

router.post('/personalize', protect, authorize('caregiver'), async (req, res) => {
  try {
    const { stressLevel, stressScore, weekly, recs } = req.body || {};
    if (!stressLevel || !Array.isArray(recs) || recs.length === 0) {
      return res.status(400).json({ success: false, message: 'stressLevel and recs are required' });
    }
    const safeRecs = recs.slice(0, 8).map((r) => ({
      id: String(r.id), title: String(r.title || ''), primaryCause: String(r.primaryCause || ''),
      recommendations: Array.isArray(r.recommendations) ? r.recommendations.slice(0, 3).map(String) : [],
    }));

    const result = await personalizeRecommendations({ stressLevel, stressScore, weekly, recs: safeRecs });
    return res.json({ success: true, personalized: result });
  } catch (err) {
    console.error('ai-coach error:', err);
    return res.json({ success: true, personalized: null });
  }
});

module.exports = router;