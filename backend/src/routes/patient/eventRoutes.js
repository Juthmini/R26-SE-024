const express = require('express');
const router = express.Router();

const { protect, authorize, resolveOwnPatientRecord } = require('../../middleware/auth');
const { getDueEvents, getUpcomingEvents, getSettings, submitReaction } = require('../../controllers/patient/eventController');

// every route here requires a logged-in patient account — the care record is
// derived from req.resolvedPatientId, never trusted from the URL/body
router.use(protect, authorize('patient'), resolveOwnPatientRecord);

router.get('/due', getDueEvents);
router.get('/upcoming', getUpcomingEvents);
router.get('/settings', getSettings);
router.post('/:id/reaction', submitReaction);

module.exports = router;
