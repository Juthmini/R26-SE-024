const express = require('express');
const router = express.Router();

const { protect, authorize, resolveLinkedPatient } = require('../../middleware/auth');
const { upsertFamilyProfile, getFamilyProfile } = require('../../controllers/family/profileController');

router.use(protect, authorize('family'), resolveLinkedPatient);

router.put('/:patientId', upsertFamilyProfile);
router.get('/:patientId', getFamilyProfile);

module.exports = router;