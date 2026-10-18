const mongoose = require('mongoose');

// Family-controlled per-patient settings. Kept as its own collection, keyed
// by patientId, the same way FamilyPatientProfile.js links to Patient without
// ever modifying it — this never touches models/caregiver/Patient.js.
const eventSettingsSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      unique: true,
    },
    allowVideoReactions: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EventSettings', eventSettingsSchema);
