const crypto = require("crypto");
const Assessment = require("../../models/cognitive/Assessment");
const User = require("../../models/auth/User");
const { listActiveQuestions } = require("./questionService");
const { buildSessionQuestions, recentVariantKeys } = require("./mmse/sessionQuestionBuilder");
const { buildScoreSnapshot } = require("./scoringService");
const { createHttpError } = require("./validationService");

async function getActiveQuestions() {
  return listActiveQuestions();
}

// How many past sessions' variants to steer away from.
const ROTATION_WINDOW_SESSIONS = 4;

// The questions a given session is scored against: its own saved set (v2+), or
// the global bank for older sessions created before per-session sets existed.
async function getSessionQuestions(assessment) {
  const set = assessment && assessment.questionSet;
  if (Array.isArray(set) && set.length > 0) return set;
  return getActiveQuestions();
}

async function buildQuestionSetForPatient(patientId) {
  // Rotation/profile lookups are best-effort: a failure here must never block
  // starting an assessment, it just means less variety this time.
  let patient = null;
  let recentKeys = [];
  try {
    [patient, recentKeys] = await Promise.all([
      User.findById(patientId).select("hometown").lean(),
      Assessment.find({ patientId })
        .sort({ createdAt: -1 })
        .limit(ROTATION_WINDOW_SESSIONS)
        .select("questionSet.variantKey")
        .lean()
        .then(recentVariantKeys),
    ]);
  } catch (error) {
    console.warn("[mmse] could not load patient history for rotation:", error.message);
  }
  return buildSessionQuestions({ patient, recentKeys, now: new Date() });
}

async function createAssessmentSession(payload) {
  const questions = await buildQuestionSetForPatient(payload.patientId);
  const registration = questions.find((q) => q.questionId === "registration");

  const doc = await Assessment.create({
    sessionId: crypto.randomUUID(),
    patientId: payload.patientId,
    caregiverId: payload.caregiverId,
    status: "active",
    totalQuestions: questions.length,
    locale: payload.locale || "en-AU",
    administrationMode: payload.administrationMode || "assisted",
    registrationWords: registration ? registration.words : [],
    questionSetVersion: 2,
    questionSet: questions,
    startedAt: new Date(),
    lastModified: new Date(),
  });

  return doc;
}

async function getAssessmentBySessionId(sessionId) {
  const assessment = await Assessment.findOne({ sessionId });
  if (!assessment) throw createHttpError("Assessment session not found", 404);
  return assessment;
}

// The assessment screen can fire overlapping writes to the same document - e.g.
// submitting an answer while tapping "Next" triggers a progress update. Because
// each handler does load-modify-save, the loser of the race hits a Mongoose
// VersionError ("No matching document ... version N"). `apply` must reload the
// document and re-apply its changes; on a version conflict we run it again
// against the freshly-saved version so concurrent writes converge instead of
// erroring out. Non-version errors (e.g. validation) propagate immediately.
async function withVersionRetry(apply, retries = 5) {
  for (let attempt = 0; ; attempt += 1) {
    const doc = await apply();
    try {
      await doc.save();
      return doc;
    } catch (err) {
      if (err && err.name === "VersionError" && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function submitAnswer(sessionId, payload) {
  return withVersionRetry(async () => {
    const assessment = await getAssessmentBySessionId(sessionId);
    const questions = await getSessionQuestions(assessment);

    if (assessment.status === "done") {
      throw createHttpError("Assessment is already completed", 409);
    }

    const question = questions.find((q) => q.questionId === payload.questionId);
    if (!question) {
      throw createHttpError("Invalid questionId", 400);
    }

    assessment.answers.set(payload.questionId, payload.answer);
    assessment.answeredAt.set(payload.questionId, payload.answeredAt || Date.now());

    if (typeof payload.timeSpentMs === "number") {
      assessment.timePerQuestion.set(payload.questionId, payload.timeSpentMs);
    }

    if (payload.skipped === true && !assessment.skipped.includes(payload.questionId)) {
      assessment.skipped.push(payload.questionId);
    }

    if (payload.questionId === "registration") assessment.recallWordsShown = true;
    if (payload.questionId === "attention_serial7") assessment.serial7Attempted = true;

    const snapshot = buildScoreSnapshot(questions, assessment.toObject());

    assessment.sectionScores = snapshot.sectionScores;
    assessment.totalScore = snapshot.totalScore;
    assessment.severity = snapshot.severity;
    assessment.impairmentFlag = snapshot.impairmentFlag;
    assessment.scoringLog = snapshot.scoringLog;
    assessment.lastModified = new Date();

    return assessment;
  });
}

async function updateProgress(sessionId, payload) {
  return withVersionRetry(async () => {
    const assessment = await getAssessmentBySessionId(sessionId);

    if (typeof payload.currentQuestionIndex === "number") {
      assessment.currentQuestionIndex = payload.currentQuestionIndex;
    }
    if (typeof payload.questionStartTime === "number") {
      assessment.questionStartTime = payload.questionStartTime;
    }
    if (payload.timeLimit === null || typeof payload.timeLimit === "number") {
      assessment.timeLimit = payload.timeLimit;
    }
    if (typeof payload.timeExpired === "boolean") {
      assessment.timeExpired = payload.timeExpired;
    }

    assessment.lastModified = new Date();
    return assessment;
  });
}

async function completeAssessment(sessionId) {
  return withVersionRetry(async () => {
    const assessment = await getAssessmentBySessionId(sessionId);
    const questions = await getSessionQuestions(assessment);

    const snapshot = buildScoreSnapshot(questions, assessment.toObject());

    assessment.sectionScores = snapshot.sectionScores;
    assessment.totalScore = snapshot.totalScore;
    assessment.severity = snapshot.severity;
    assessment.impairmentFlag = snapshot.impairmentFlag;
    assessment.scoringLog = snapshot.scoringLog;

    assessment.status = "done";
    assessment.completedAt = new Date();
    assessment.lastModified = new Date();

    return assessment;
  });
}

async function listAssessmentsByPatient(patientId) {
  return Assessment.find({ patientId }).sort({ createdAt: -1 }).lean();
}

module.exports = {
  createAssessmentSession,
  getAssessmentBySessionId,
  submitAnswer,
  updateProgress,
  completeAssessment,
  listAssessmentsByPatient,
  getSessionQuestions,
};
