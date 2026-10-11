const express = require('express');
const router = express.Router();

const {
  warmupEmotionService,
  captureEmotion,
  logEmotionReading,
  finalizeSession,
  getPatientOutcomes,
} = require('../../controllers/family/emotionController');

router.get('/warmup', warmupEmotionService);
router.post('/capture', captureEmotion);
router.post('/log', logEmotionReading);
router.post('/finalize', finalizeSession);
router.get('/outcomes/:patientId', getPatientOutcomes);

module.exports = router;