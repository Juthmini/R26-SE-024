const express = require('express');
const router = express.Router();

const { protect, authorize, resolveLinkedPatient } = require('../../middleware/auth');
const {
  warmupEmotionService,
  captureEmotion,
  logEmotionReading,
  finalizeSession,
  getPatientOutcomes,
  acknowledgeAlert,
  recordAction,
  recordFollowUp,
  getEngagementStats,
} = require('../../controllers/family/emotionController');

router.use(protect, authorize('family'), resolveLinkedPatient);

router.get('/warmup', warmupEmotionService);
router.post('/capture', captureEmotion);
router.post('/log', logEmotionReading);
router.post('/finalize', finalizeSession);
router.get('/outcomes/:patientId', getPatientOutcomes);
router.patch('/outcomes/:id/acknowledge', acknowledgeAlert);
router.patch('/outcomes/:id/act', recordAction);
router.patch('/outcomes/:id/followup', recordFollowUp);
router.get('/engagement-stats/:patientId', getEngagementStats);

module.exports = router;