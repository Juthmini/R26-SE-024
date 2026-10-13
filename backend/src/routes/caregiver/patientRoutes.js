const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  addRoutine,
  toggleRoutine,
  deleteRoutine,
  deriveRoutine,
} = require('../../controllers/caregiver/patientController');

//  All routes protected - only caregivers
router.get('/',    protect, authorize('caregiver'), getPatients);
router.post('/',   protect, authorize('caregiver'), createPatient);
router.get('/:id', protect, authorize('caregiver'), getPatientById);
router.put('/:id', protect, authorize('caregiver'), updatePatient);
router.delete('/:id', protect, authorize('caregiver'), deletePatient);

router.post('/:id/routines',                    protect, authorize('caregiver'), addRoutine);
router.patch('/:id/routines/:routineId/toggle', protect, authorize('caregiver'), toggleRoutine);
router.delete('/:id/routines/:routineId',       protect, authorize('caregiver'), deleteRoutine);
router.post('/:id/derive-routine',              protect, authorize('caregiver'), deriveRoutine);

module.exports = router;