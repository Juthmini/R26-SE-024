const express = require('express');
const router = express.Router();

const { protect, authorize, resolveOwnPatientRecord } = require('../../middleware/auth');
const { getMyMemories, incrementMyMemoryPlayCount } = require('../../controllers/patient/memoryController');

// every route here requires a logged-in patient account — the care record is
// derived from req.resolvedPatientId, never trusted from the URL/body
router.use(protect, authorize('patient'), resolveOwnPatientRecord);

router.get('/', getMyMemories);
router.patch('/:id/play', incrementMyMemoryPlayCount);

module.exports = router;
