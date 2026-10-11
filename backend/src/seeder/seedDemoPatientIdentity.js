// Aligns the demo patient identity across both Patient models so the real
// patient login (face-scan/ID number, PatientRegistry model) and the
// family-created memories (caregiver/Patient model) point at the SAME
// person — required because those are two separate collections in this
// codebase. Uses a fixed shared _id so both sides resolve to one identity.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const PatientRegistry = require('../models/Patient');
const CaregiverPatient = require('../models/caregiver/Patient');

const SHARED_ID = '6a8eb91cb3e48b7f1a6ccc06';

const seed = async () => {
  await connectDB();

  // 1. update the caregiver/Patient doc (used by the family module) — same
  //    _id already exists, just rename it
  const familyPatient = await CaregiverPatient.findByIdAndUpdate(
    SHARED_ID,
    { name: 'Shan', initials: 'S' },
    { new: true }
  );
  console.log(familyPatient
    ? `✅ caregiver/Patient renamed -> "${familyPatient.name}"`
    : '⚠️  caregiver/Patient not found — expected it to already exist');

  // 2. upsert a PatientRegistry doc with the SAME _id, so logging in via
  //    ID Number on the real patient app resolves to this same identity
  const registryPatient = await PatientRegistry.findByIdAndUpdate(
    SHARED_ID,
    {
      $setOnInsert: {
        _id: new mongoose.Types.ObjectId(SHARED_ID),
        title: 'Ms',
        gender: 'Other',
        nic: 'DEMO0000000',
        dob: new Date('1955-01-01'),
        joiningDate: new Date(),
        registrationNumber: 'PAT-2026-SHAN',
        mobile: '0000000000',
        addressLine1: 'Demo Address',
      },
      firstName: 'Shan',
      lastName: ' ',
      customerCode: 'PAT-2026-SHAN',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`✅ PatientRegistry ready -> id ${registryPatient._id}, login code "${registryPatient.customerCode}"`);

  console.log('\nLog in on the real patient app with ID Number: PAT-2026-SHAN');
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
