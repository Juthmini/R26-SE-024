const express = require('express');
const router  = express.Router();

const {
  createMemory,
  getMemoriesByPatient,
  getMemoryById,
  getCategoryRecommendation,
  incrementPlayCount,
   deleteMemory,
} = require('../../controllers/family/memoryController');

router.post('/', createMemory);
router.get('/patient/:patientId', getMemoriesByPatient);
router.get('/recommendation/:patientId', getCategoryRecommendation);
router.get('/:id', getMemoryById);
router.patch('/:id/play', incrementPlayCount);
router.delete('/:id', deleteMemory);

module.exports = router;