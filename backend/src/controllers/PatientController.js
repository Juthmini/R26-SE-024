const Patient = require('../models/Patient');

const generateRoutine = (categoriesStr) => {
  if (!categoriesStr) return [];
  const cats = categoriesStr.toLowerCase();
  const routine = [];
  routine.push({ time: "07:00 AM", task: "Wake up & Morning Tea" });
  
  if (cats.includes("medicine") || cats.includes("parkinson")) {
    routine.push({ time: "08:00 AM", task: "Take Morning Medicine" });
    routine.push({ time: "02:00 PM", task: "Take Afternoon Medicine" });
  }
  if (cats.includes("mobility")) {
    routine.push({ time: "09:00 AM", task: "Assisted Physiotherapy" });
  } else {
    routine.push({ time: "09:00 AM", task: "Garden Walk" });
  }
  if (cats.includes("memory")) {
    routine.push({ time: "10:30 AM", task: "Cognitive Puzzle / Memory Game" });
    routine.push({ time: "05:00 PM", task: "Family Video Call (Reminiscing)" });
  }
  if (cats.includes("incontinence")) {
    routine.push({ time: "10:00 AM", task: "Washroom Break" });
    routine.push({ time: "01:00 PM", task: "Washroom Break" });
    routine.push({ time: "04:00 PM", task: "Washroom Break" });
    routine.push({ time: "08:00 PM", task: "Washroom Break" });
  }
  routine.push({ time: "01:00 PM", task: "Lunch" });
  routine.push({ time: "09:00 PM", task: "Sleep" });
  
  return routine.sort((a,b) => {
    const tA = new Date('1970/01/01 ' + a.time);
    const tB = new Date('1970/01/01 ' + b.time);
    return tA - tB;
  });
}; // This exports PatientRegistry

// @desc    Register a new patient
// @route   POST /api/patients
const registerPatient = async (req, res) => {
  try {
    const patientData = req.body;
    
    // Check if customer code already exists
    const existingPatient = await Patient.findOne({ customerCode: patientData.customerCode });
    if (existingPatient) {
      return res.status(400).json({ message: 'Customer code already exists' });
    }

    const patient = new Patient(patientData);
    await patient.save();
    
    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: patient
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk upload patients
// @route   POST /api/patients/bulk
const bulkUploadPatients = async (req, res) => {
  try {
    const patients = req.body;
    if (!Array.isArray(patients)) return res.status(400).json({ message: 'Invalid data format.' });

    // Generate routines for each patient before saving
    const processedPatients = patients.map(p => ({
      ...p,
      routines: p.keyCategories ? generateRoutine(p.keyCategories) : []
    }));

    const result = await Patient.insertMany(processedPatients, { ordered: false });
    res.status(201).json({ success: true, message: 'patients uploaded successfully', data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all patients
// @route   GET /api/patients
//
// Patient identity for this app is the caregiver "Patient" model (collection
// "patients", src/models/caregiver/Patient.js) - the one real, populated
// patient registration flow. The old PatientRegistry model this function
// used to read from (src/models/Patient.js, collection "patientregistries")
// is confirmed empty and unused, so it's dropped entirely rather than merged
// in, to avoid carrying two parallel, inconsistent patient identities through
// every feature built on top of this list (Personal Vault, Find My Things,
// mobile login all key off these same records now).
const getAllPatients = async (req, res) => {
  try {
    const rawDocs = await Patient.db.collection('patients').find({}).sort({ createdAt: -1 }).toArray();
    const patients = rawDocs.map((doc) => {
      const nameParts = (doc.name || doc.initials || 'Unknown').trim().split(' ');
      return {
        _id: doc._id,
        firstName: nameParts[0] || 'Unknown',
        lastName: nameParts.slice(1).join(' ') || '',
        customerCode: `EXT-${String(doc._id).slice(-6).toUpperCase()}`,
        condition: doc.condition || '',
        age: doc.age,
        createdAt: doc.createdAt,
      };
    });

    res.status(200).json({ success: true, data: patients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get patient by ID
// @route   GET /api/admin/patients/by-id/:id
const getPatientById = async (req, res) => {
  try {
    console.log('Fetching patient by ID:', req.params.id);
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get patient by customer code
// @route   GET /api/patients/:code
const getPatientByCode = async (req, res) => {
  try {
    const patient = await Patient.findOne({ customerCode: req.params.code });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update patient
// @route   PUT /api/patients/:id
const updatePatient = async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerPatient,
  bulkUploadPatients,
  getAllPatients,
  getPatientByCode,
  getPatientById,
  updatePatient
};

