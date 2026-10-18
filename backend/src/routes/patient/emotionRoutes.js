const express = require('express');
const router = express.Router();

const { protect, authorize, resolveOwnPatientRecord } = require('../../middleware/auth');
const {
  warmupEmotionService,
  captureEmotion,
  logEmotionReading,
  finalizeSession,
} = require('../../controllers/patient/emotionController');

// every route here requires a logged-in patient account — the care record is
// derived from req.resolvedPatientId, never trusted from the URL/body
router.use(protect, authorize('patient'), resolveOwnPatientRecord);

router.get('/warmup', warmupEmotionService);
router.post('/capture', captureEmotion);
router.post('/log', logEmotionReading);
router.post('/finalize', finalizeSession);

module.exports = router;
