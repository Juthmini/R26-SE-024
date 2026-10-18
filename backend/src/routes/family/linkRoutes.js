const express = require('express');
const router = express.Router();

const { protect, authorize, resolveLinkedPatient } = require('../../middleware/auth');
const { getMyLinkedPatient } = require('../../controllers/family/linkController');

router.get('/me', protect, authorize('family'), resolveLinkedPatient, getMyLinkedPatient);

module.exports = router;
