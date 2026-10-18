const FamilyPatientProfile = require('../../models/family/FamilyPatientProfile');
// NOTE: this must be the caregiver care-record model, not models/Patient.js
// (the separate, unrelated PatientRegistry/biometric model) — family
// profiles are keyed to the same Patient this patientId already means
// everywhere else in the family module.
const Patient = require('../../models/caregiver/Patient');

const upsertFamilyProfile = async (req, res) => {
  try {
    const patientId = req.linkedPatientId;
    const { spouse, children, hometown, occupation, favouriteFood, importantPlaces } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const profile = await FamilyPatientProfile.findOneAndUpdate(
      { patientId },
      { spouse, children, hometown, occupation, favouriteFood, importantPlaces },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getFamilyProfile = async (req, res) => {
  try {
    const patientId = req.linkedPatientId;
    const profile = await FamilyPatientProfile.findOne({ patientId });

    res.status(200).json({ success: true, profile: profile || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { upsertFamilyProfile, getFamilyProfile };