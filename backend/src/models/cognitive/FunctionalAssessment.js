const mongoose = require('mongoose');

// One row per submission of the Functional Activities Questionnaire (FAQ) -
// a 10-item, caregiver-answered scale about the patient's day-to-day function.
// It is the feature that lifts the dementia triage model from ~64% to ~93%
// accuracy (see ml-service/dementia/train.py). Stored per patient, tied to the
// screening-test session it followed, so the predict route can pick up the
// latest one and the Reporting tab can chart function over time.

const FAQ_ITEMS = [
  'bills', 'taxes', 'shopping', 'games', 'stove',
  'mealPrep', 'events', 'payAttention', 'remindDates', 'travel',
];

const answerField = {
  type: Number,
  required: true,
  min: 0, // 0 = normal / no difficulty
  max: 3, // 3 = dependent, someone else does it
};

const schemaFields = {
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  basedOnAssessment: { type: String, default: null }, // Assessment.sessionId
  total: { type: Number, default: 0 }, // sum of the 10 items, 0-30
};
for (const item of FAQ_ITEMS) schemaFields[item] = { ...answerField };

const FunctionalAssessmentSchema = new mongoose.Schema(schemaFields, {
  timestamps: true,
  collection: 'functional_assessments',
});

FunctionalAssessmentSchema.index({ patientId: 1, createdAt: -1 });

const FunctionalAssessment = mongoose.model(
  'FunctionalAssessment',
  FunctionalAssessmentSchema,
);
FunctionalAssessment.FAQ_ITEMS = FAQ_ITEMS;

module.exports = FunctionalAssessment;
