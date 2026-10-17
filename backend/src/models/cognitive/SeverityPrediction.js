const mongoose = require('mongoose');

// One row per call to the dementia model (ml-service/dementia/train.py).
// Persisted so the Reporting tab can chart the result over time, not just
// show whatever the last live prediction happened to be.
//
// The model is a single 2-class triage: `monitor` (keep monitoring at home)
// vs `escalate` (recommend a clinical review), ~93% CV accuracy.
const SeverityPredictionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    basedOnAssessment: { type: String, default: null }, // Assessment.sessionId
    basedOnFaq: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    }, // FunctionalAssessment._id

    triage: {
      type: String,
      enum: ['monitor', 'escalate'],
      required: true,
    },
    confidence: { type: Number, required: true }, // 0-1, max class probability
    probabilities: {
      monitor: Number,
      escalate: Number,
    },

    message: { type: String, default: '' },
  },
  { timestamps: true, collection: 'severity_predictions' }
);

SeverityPredictionSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('SeverityPrediction', SeverityPredictionSchema);
