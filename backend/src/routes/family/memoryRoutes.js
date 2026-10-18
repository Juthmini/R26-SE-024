const express = require('express');
const router  = express.Router();

const { protect, authorize, resolveLinkedPatient } = require('../../middleware/auth');
const {
  createMemory,
  getMemoriesByPatient,
  getMemoryById,
  getCategoryRecommendation,
  incrementPlayCount,
   deleteMemory,
} = require('../../controllers/family/memoryController');

// every route here requires a logged-in family account linked to a patient —
// patientId is derived from req.linkedPatientId in the controllers below,
// never trusted from the URL/body
router.use(protect, authorize('family'), resolveLinkedPatient);

router.post('/', createMemory);
router.get('/patient/:patientId', getMemoriesByPatient);
router.get('/recommendation/:patientId', getCategoryRecommendation);
router.get('/:id', getMemoryById);
router.patch('/:id/play', incrementPlayCount);
router.delete('/:id', deleteMemory);

module.exports = router;