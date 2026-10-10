

const mongoose = require('mongoose');
const Patient = require('../../models/caregiver/Patient');
const User = require('../../models/auth/User');

// Real-world routine templates per derived category. Kept here (rather than
// a free-text field a caregiver has to remember to fill in) because every
// value below comes from assessment data the app already collects.
const ROUTINE_TEMPLATES = {
  medicine: [
    { title: 'Take Morning Medicine', time: '08:00 AM' },
    { title: 'Take Afternoon Medicine', time: '02:00 PM' },
  ],
  memory: [
    { title: 'Cognitive Puzzle / Memory Game', time: '10:30 AM' },
    { title: 'Family Video Call (Reminiscing)', time: '05:00 PM' },
  ],
  mobility: [{ title: 'Assisted Physiotherapy', time: '09:00 AM' }],
  incontinence: [
    { title: 'Washroom Break', time: '10:00 AM' },
    { title: 'Washroom Break', time: '01:00 PM' },
    { title: 'Washroom Break', time: '04:00 PM' },
    { title: 'Washroom Break', time: '08:00 PM' },
  ],
};

// Derive which routine categories this patient actually needs, from REAL
// assessment data already collected elsewhere in the app - not a caregiver's
// free-text guess. Each category is traceable back to a concrete source:
//   medicine     <- has any Medication record
//   memory       <- cognitive Assessment severity/recall score
//   mobility     <- functional (FAQ) assessment's physical-task items
// incontinence is intentionally NOT derived - it's a clinical fact no
// assessment here captures, so it stays a manual flag a caregiver sets once.
async function deriveCategoriesFromAssessments(patient) {
  const db = mongoose.connection.db;
  const categories = new Set();
  const sources = {};

  const medCount = await db.collection('medications').countDocuments({ patientId: patient._id });
  if (medCount > 0) {
    categories.add('medicine');
    sources.medicine = `${medCount} active medication record(s)`;
  }

  if (patient.registeredPatientId) {
    const latestAssessment = await db
      .collection('assessments')
      .find({ patientId: patient.registeredPatientId, status: 'done' })
      .sort({ completedAt: -1 })
      .limit(1)
      .toArray();

    if (latestAssessment.length) {
      const a = latestAssessment[0];
      const recall = a.sectionScores?.Recall ?? null;
      const registration = a.sectionScores?.Registration ?? null;
      const impaired =
        a.severity === 'moderate' ||
        a.severity === 'severe' ||
        (recall !== null && recall <= 1) ||
        (registration !== null && registration <= 1);
      if (impaired) {
        categories.add('memory');
        sources.memory = `cognitive assessment severity="${a.severity}", Recall=${recall}, Registration=${registration}`;
      }
    }

    const latestFunctional = await db
      .collection('functional_assessments')
      .find({ patientId: patient.registeredPatientId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (latestFunctional.length) {
      const f = latestFunctional[0];
      // FAQ scale: 0 = normal/independent, 3 = dependent (someone else does it).
      const physicallyImpaired = [f.mealPrep, f.travel, f.stove].some((v) => v >= 2);
      if (physicallyImpaired) {
        categories.add('mobility');
        sources.mobility = `functional assessment mealPrep=${f.mealPrep}, travel=${f.travel}, stove=${f.stove}`;
      }
    }
  }

  return { categories: Array.from(categories), sources };
}

function buildRoutineItems(categories) {
  const items = [
    { title: 'Wake up & Morning Tea', time: '07:00 AM' },
    { title: 'Lunch', time: '01:00 PM' },
    { title: 'Sleep', time: '09:00 PM' },
  ];
  categories.forEach((cat) => {
    (ROUTINE_TEMPLATES[cat] || []).forEach((item) => items.push(item));
  });
  if (!categories.includes('mobility')) {
    items.push({ title: 'Garden Walk', time: '09:00 AM' });
  }
  return items.sort((a, b) => a.time.localeCompare(b.time));
}

// POST /:id/derive-routine - (re)generates this patient's routine from real
// assessment/medication data, preserving completionLog on any routine item
// whose title+time already existed (so toggling history isn't lost on refresh).
const deriveRoutine = async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await Patient.findOne({ _id: id, caregiverId: req.user.userId });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const manualIncontinence = req.body?.incontinence === true;
    const { categories, sources } = await deriveCategoriesFromAssessments(patient);
    if (manualIncontinence) categories.push('incontinence');

    const existingByKey = new Map(
      patient.routines.map((r) => [`${r.title}|${r.time}`, r])
    );
    const newRoutines = buildRoutineItems(categories).map((item) => {
      const existing = existingByKey.get(`${item.title}|${item.time}`);
      return existing
        ? existing
        : { title: item.title, time: item.time, completed: false, completionLog: [] };
    });

    patient.routines = newRoutines;
    await patient.save();

    res.status(200).json({
      success: true,
      derivedCategories: categories,
      derivedFrom: sources,
      patient,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET all patients 
const getPatients = async (req, res) => {
  try {
    // ✅ Use JWT user ID - not query param
    const caregiverId = req.user.userId;
    const patients = await Patient.find({ caregiverId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: patients.length, patients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET single patient 
const getPatientById = async (req, res) => {
  try {
    
    const patient = await Patient.findOne({
      _id: req.params.id,
      caregiverId: req.user.userId,
    });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.status(200).json({ success: true, patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CREATE patient 
const createPatient = async (req, res) => {
  try {
    const {
      name, initials, age, condition, stage,
      avatarColor, emoji, condition_notes,
      condition_description, userId,
    } = req.body;

    if (!name || !age || !condition || !stage) {
      return res.status(400).json({
        success: false,
        message: 'name, age, condition and stage are required',
      });
    }

    let registeredPatientId = null;
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'userId must be a valid registered patient id',
        });
      }

      const registeredPatient = await User.findOne({ _id: userId, role: 'patient' });
      if (!registeredPatient) {
        return res.status(404).json({
          success: false,
          message: 'Registered patient not found',
        });
      }

      if (
        registeredPatient.assignedCaregiverId &&
        registeredPatient.assignedCaregiverId.toString() !== req.user.userId.toString()
      ) {
        return res.status(409).json({
          success: false,
          message: 'Registered patient is already linked to another caregiver',
        });
      }

      registeredPatient.assignedCaregiverId = req.user.userId;
      await registeredPatient.save({ validateBeforeSave: false });
      registeredPatientId = registeredPatient._id;
    }

    const patient = await Patient.create({
      name, initials, age, condition, stage,
      avatarColor:           avatarColor || '#4F8EF7',
      emoji:                 emoji || '🙂',
      lastChecked:           'Just now',
      condition_notes:       condition_notes || 'No notes added',
      condition_description: condition_description || 'No description provided.',
      routines:              [],
      registeredPatientId,
      
      caregiverId: req.user.userId,
    });

    res.status(201).json({ success: true, patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// UPDATE patient 
const updatePatient = async (req, res) => {
  try {
    // ✅ Only update if belongs to this caregiver
    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, caregiverId: req.user.userId },
      { ...req.body },
      { new: true, runValidators: true }
    );
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.status(200).json({ success: true, patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE patient 
const deletePatient = async (req, res) => {
  try {
    // ✅ Only delete if belongs to this caregiver
    const patient = await Patient.findOneAndDelete({
      _id: req.params.id,
      caregiverId: req.user.userId,
    });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.status(200).json({ success: true, message: 'Patient deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADD routine 
const addRoutine = async (req, res) => {
  try {
    const { title, time } = req.body;
    if (!title || !time) {
      return res.status(400).json({ success: false, message: 'title and time are required' });
    }

    // Only add routine if patient belongs to this caregiver
    const patient = await Patient.findOne({
      _id: req.params.id,
      caregiverId: req.user.userId,
    });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    patient.routines.push({ title, time, completed: false });
    await patient.save();

    res.status(201).json({
      success: true,
      routine: patient.routines[patient.routines.length - 1],
      patient,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// TOGGLE routine 
const toggleRoutine = async (req, res) => {
  try {
    const { id, routineId } = req.params;

    const patient = await Patient.findOne({
      _id: id,
      caregiverId: req.user.userId,
    });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const routine = patient.routines.id(routineId);
    if (!routine) {
      return res.status(404).json({ success: false, message: 'Routine not found' });
    }

    routine.completed = !routine.completed;
    if (routine.completed) {
      routine.completionLog.push(new Date());
    }
    await patient.save();

    res.status(200).json({ success: true, routine, patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE routine 
const deleteRoutine = async (req, res) => {
  try {
    const { id, routineId } = req.params;

    const patient = await Patient.findOne({
      _id: id,
      caregiverId: req.user.userId,
    });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    patient.routines = patient.routines.filter(
      (r) => r._id.toString() !== routineId
    );
    await patient.save();

    res.status(200).json({ success: true, message: 'Routine deleted', patient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  addRoutine,
  toggleRoutine,
  deleteRoutine,
  deriveRoutine,
};
