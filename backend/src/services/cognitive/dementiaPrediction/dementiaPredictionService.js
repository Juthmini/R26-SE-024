const axios = require('axios');
const FunctionalAssessment = require('../../../models/cognitive/FunctionalAssessment');
const SeverityPrediction = require('../../../models/cognitive/SeverityPrediction');
const { createHttpError } = require('../validationService');

// Dementia Flask API - own port so it starts/restarts independently of the
// caregiver stress model. Mirrors ml-service/caregiver -> insightRoutes.js.
// Dementia model (ml-service/dementia). Set DEMENTIA_ML_URL when it runs elsewhere (e.g. Render).
const ML_URL = process.env.DEMENTIA_ML_URL || 'http://localhost:5002';

const { FAQ_ITEMS } = FunctionalAssessment; // 10 keys: bills..travel

// ── FAQ persistence ────────────────────────────────────────────────────────
function normaliseFaqAnswers(raw) {
  if (!raw || typeof raw !== 'object') {
    throw createHttpError('faq answers object is required', 400);
  }
  const answers = {};
  const bad = [];
  for (const item of FAQ_ITEMS) {
    const v = Number(raw[item]);
    if (!Number.isInteger(v) || v < 0 || v > 3) {
      bad.push(item);
    } else {
      answers[item] = v;
    }
  }
  if (bad.length) {
    throw createHttpError('faq answers must be integers 0-3', 400, { invalid: bad });
  }
  return answers;
}

async function saveFaq(patientId, rawAnswers, basedOnAssessment = null) {
  const answers = normaliseFaqAnswers(rawAnswers);
  const total = FAQ_ITEMS.reduce((sum, item) => sum + answers[item], 0);
  return FunctionalAssessment.create({
    patientId,
    basedOnAssessment: basedOnAssessment || null,
    ...answers,
    total,
  });
}

async function getLatestFaq(patientId) {
  return FunctionalAssessment.findOne({ patientId }).sort({ createdAt: -1 });
}

// ── ML call ────────────────────────────────────────────────────────────────
function buildPayload({ patient, assessment, faq }) {
  const answers = {};
  for (const item of FAQ_ITEMS) answers[item] = faq[item];
  return {
    age: patient?.age || 75,
    // User has no educationYears field yet; 12 is a safe default and the model
    // still hits ~93% with education held constant (see train.py).
    educationYears: patient?.educationYears ?? 12,
    totalScore: assessment?.adjustedScore ?? assessment?.totalScore ?? 27,
    sex: patient?.gender ? String(patient.gender)[0].toUpperCase() : '',
    faq: answers,
  };
}

async function requestPrediction({ patient, assessment, faq }) {
  const payload = buildPayload({ patient, assessment, faq });
  // 70s: long enough for a sleeping free-tier host (Render) to wake up.
  const res = await axios.post(`${ML_URL}/predict`, payload, { timeout: 70000 });
  return res.data;
}

// ── Persist one prediction row (best-effort; caller keeps returning the
//    prediction even if this throws) ──────────────────────────────────────
async function persistPrediction({ patientId, assessment, faq, ml }) {
  return SeverityPrediction.create({
    patientId,
    basedOnAssessment: assessment?.sessionId ?? null,
    basedOnFaq: faq?._id ?? null,
    triage: ml.triage,
    confidence: ml.confidence,
    probabilities: ml.probabilities,
    message: ml.message ?? '',
  });
}

module.exports = {
  ML_URL,
  FAQ_ITEMS,
  normaliseFaqAnswers,
  saveFaq,
  getLatestFaq,
  requestPrediction,
  persistPrediction,
};
