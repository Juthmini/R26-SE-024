const Patient = require('../../models/caregiver/Patient');

// --- GET the patient care record the authenticated family user is linked
//     to (set at registration via the patient's email) ---
const getMyLinkedPatient = async (req, res) => {
  try {
    const record = await Patient.findById(req.linkedPatientId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Linked patient record not found.' });
    }
    res.status(200).json({ success: true, patient: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getMyLinkedPatient };
