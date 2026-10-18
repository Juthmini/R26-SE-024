const EmotionLog = require('../../models/family/EmotionLog');
const SessionOutcome = require('../../models/family/SessionOutcome');
const { classifyEmotion, ensureReady } = require('../../services/emotion/faceEmotionDetector');

// Local, self-hosted classifier (see services/emotion/faceEmotionDetector.js)
// — replaced the Hugging Face hosted model after it started requiring paid
// credits for every call. Its labels still match EmotionLog's enum
// (happy/sad/angry/surprise/fear/disgust/neutral).
const EMOTION_KEYS = ['happy', 'sad', 'angry', 'surprise', 'fear', 'disgust', 'neutral'];

// valence weights — Option 2, confidence-weighted scoring
const VALENCE_WEIGHTS = {
    happy: 2,
    surprise: 1,
    neutral: 0,
    sad: -1,
    fear: -1,
    disgust: -1,
    angry: -2,
};

// calculates a single reading's positivity score from its 
// full confidence breakdown (0-100 scale per emotion)
function calculatePositivity(emotionScores) {
    let score = 0;
    for (const [emotion, weight] of Object.entries(VALENCE_WEIGHTS)) {
        const confidence = emotionScores[emotion] || 0;
        score += (confidence / 100) * weight;
    }
    return score;
}

// --- WARMUP — loads the local model into memory before real-time captures
//     start (first load does real file I/O + graph construction; after
//     that, classifyEmotion calls are fast). Fire-and-forget. ---
const warmupEmotionService = (req, res) => {
    ensureReady().catch(() => {
        // don't care about the result here — just want it loaded
    });
    res.status(202).json({ success: true, message: 'Warmup ping sent' });
};

// --- CAPTURE — receives a photo from the app, forwards to
//     the deployed emotion detection service, logs the result ---
const captureEmotion = async (req, res) => {
    try {
        const {
            memoryId,
            sessionId,
            secondsIntoPlayback,
            photoBase64,
        } = req.body;
        const patientId = req.linkedPatientId;

        if (!memoryId || !sessionId || !photoBase64) {
            return res.status(400).json({
                success: false,
                message: 'memoryId, sessionId and photoBase64 are required',
            });
        }

        const buffer = Buffer.from(photoBase64, 'base64');
        console.log(`[emotion] captured frame: ${buffer.length} bytes, session ${sessionId}, t=${secondsIntoPlayback}s`);

        let predictions;
        try {
            predictions = await classifyEmotion(buffer);
        } catch (detectionError) {
            if (detectionError.noFaceDetected) {
                // expected/normal — patient looked away, poor lighting, etc.
                // Not an error worth logging as a failure or a 500: there's
                // just nothing to record for this one tick.
                return res.status(200).json({ success: true, skipped: true, message: 'No face detected in frame' });
            }
            console.error('[emotion] local classification failed:', detectionError.message);
            throw detectionError;
        }

        // predictions: [{ label: 'happy', score: 0.83 }, ...] — build the
        // 0-100 scale breakdown the rest of the app expects, defaulting any
        // class HF didn't return to 0
        const emotionScores = Object.fromEntries(EMOTION_KEYS.map((k) => [k, 0]));
        let dominantEmotion = EMOTION_KEYS[0];
        let topScore = -1;
        for (const { label, score } of predictions) {
            const key = label.toLowerCase();
            if (!(key in emotionScores)) continue;
            emotionScores[key] = Math.round(score * 10000) / 100; // 0-1 -> 0-100
            if (score > topScore) {
                topScore = score;
                dominantEmotion = key;
            }
        }

        const log = await EmotionLog.create({
            patientId,
            memoryId,
            sessionId,
            secondsIntoPlayback: secondsIntoPlayback || 0,
            dominantEmotion,
            emotionScores,
        });

        res.status(201).json({ success: true, log });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- LOG a single emotion reading directly (kept for manual/testing use) ---
const logEmotionReading = async (req, res) => {
    try {
        const {
            memoryId,
            sessionId,
            secondsIntoPlayback,
            dominantEmotion,
            emotionScores,
        } = req.body;
        const patientId = req.linkedPatientId;

        if (!memoryId || !sessionId || !dominantEmotion) {
            return res.status(400).json({
                success: false,
                message: 'memoryId, sessionId and dominantEmotion are required',
            });
        }

        const log = await EmotionLog.create({
            patientId,
            memoryId,
            sessionId,
            secondsIntoPlayback: secondsIntoPlayback || 0,
            dominantEmotion,
            emotionScores: emotionScores || {},
        });

        res.status(201).json({ success: true, log });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- FINALIZE a session — calculate moodLift, save SessionOutcome ---
const finalizeSession = async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId is required',
            });
        }

        const readings = await EmotionLog.find({ sessionId }).sort({
            secondsIntoPlayback: 1,
        });

        if (readings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No emotion readings found for this session',
            });
        }

        // take up to first 3 and last 3 readings
        const firstReadings = readings.slice(0, Math.min(3, readings.length));
        const lastReadings = readings.slice(-Math.min(3, readings.length));

        const avgPositivity = (readingSet) => {
            const scores = readingSet.map((r) => calculatePositivity(r.emotionScores));
            return scores.reduce((sum, s) => sum + s, 0) / scores.length;
        };

        // real 0-100 confidence percentages for one emotion, averaged across
        // a set of readings — what the family dashboard actually displays
        const avgEmotionPercent = (readingSet, emotion) => {
            const scores = readingSet.map((r) => r.emotionScores[emotion] || 0);
            return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
        };

        const baselinePositivity = avgPositivity(firstReadings);
        const finalPositivity = avgPositivity(lastReadings);
        const moodLift = finalPositivity - baselinePositivity;

        const sadBeforePercent = avgEmotionPercent(firstReadings, 'sad');
        const happyBeforePercent = avgEmotionPercent(firstReadings, 'happy');
        const happyAfterPercent = avgEmotionPercent(lastReadings, 'happy');
        const moodShiftPercent = Math.round((happyAfterPercent - happyBeforePercent) * 10) / 10;

        // find the single most positive reading across the whole session
        let peakReading = readings[0];
        let peakScore = calculatePositivity(readings[0].emotionScores);
        for (const r of readings) {
            const s = calculatePositivity(r.emotionScores);
            if (s > peakScore) {
                peakScore = s;
                peakReading = r;
            }
        }

        // simple threshold — worth tuning after real testing
        const ALERT_THRESHOLD = 1.0;
        const alertTriggered = moodLift >= ALERT_THRESHOLD;

        // whichever dominant emotion showed up most often across the whole
        // session — "what was she mostly feeling", not just start/end
        const emotionCounts = {};
        for (const r of readings) {
            emotionCounts[r.dominantEmotion] = (emotionCounts[r.dominantEmotion] || 0) + 1;
        }
        const mostFrequentEmotion = Object.entries(emotionCounts)
            .sort((a, b) => b[1] - a[1])[0][0];

        const outcome = await SessionOutcome.findOneAndUpdate(
            { sessionId },
            {
                patientId: readings[0].patientId,
                memoryId: readings[0].memoryId,
                sessionId,
                baselineEmotion: firstReadings[0].dominantEmotion,
                peakEmotion: peakReading.dominantEmotion,
                finalEmotion: lastReadings[lastReadings.length - 1].dominantEmotion,
                mostFrequentEmotion,
                moodLift: Math.round(moodLift * 100) / 100,
                totalReadings: readings.length,
                alertTriggered,
                sadBeforePercent,
                happyBeforePercent,
                happyAfterPercent,
                moodShiftPercent,
                playbackDurationSeconds:
                    readings[readings.length - 1].secondsIntoPlayback,
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, outcome });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- ACKNOWLEDGE an alert — marks a session outcome as handled so it
//     stops showing as the active "Predictive Engagement" alert ---
const acknowledgeAlert = async (req, res) => {
    try {
        const existing = await SessionOutcome.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Outcome not found',
            });
        }
        if (existing.patientId.toString() !== req.linkedPatientId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this outcome',
            });
        }

        const outcome = await SessionOutcome.findByIdAndUpdate(
            req.params.id,
            { acknowledged: true },
            { new: true }
        );

        res.status(200).json({ success: true, outcome });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- RECORD ACTION — family tapped "Call Now" on an alert. Also
//     acknowledges it, since acting on an alert is a stronger signal than a
//     plain dismiss and the family shouldn't see the same card twice ---
const recordAction = async (req, res) => {
    try {
        const existing = await SessionOutcome.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Outcome not found',
            });
        }
        if (existing.patientId.toString() !== req.linkedPatientId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this outcome',
            });
        }

        const outcome = await SessionOutcome.findByIdAndUpdate(
            req.params.id,
            { actedAt: new Date(), acknowledged: true },
            { new: true }
        );

        res.status(200).json({ success: true, outcome });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- RECORD FOLLOW-UP — family reports how the call actually went ---
const recordFollowUp = async (req, res) => {
    try {
        const { followUpOutcome } = req.body;

        if (!['positive', 'neutral', 'difficult'].includes(followUpOutcome)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid followUpOutcome value',
            });
        }

        const existing = await SessionOutcome.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Outcome not found',
            });
        }
        if (existing.patientId.toString() !== req.linkedPatientId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this outcome',
            });
        }

        const outcome = await SessionOutcome.findByIdAndUpdate(
            req.params.id,
            { followUpOutcome },
            { new: true }
        );

        res.status(200).json({ success: true, outcome });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- GET engagement stats — did families act on alerts, and did it help ---
const getEngagementStats = async (req, res) => {
    try {
        const patientId = req.linkedPatientId;
        const outcomes = await SessionOutcome.find({ patientId, alertTriggered: true });

        const totalAlerts = outcomes.length;
        const actedOn = outcomes.filter((o) => o.actedAt).length;
        const withFollowUp = outcomes.filter((o) => o.followUpOutcome);
        const positive = withFollowUp.filter((o) => o.followUpOutcome === 'positive').length;

        const avgResponseMs = outcomes
            .filter((o) => o.actedAt)
            .reduce((sum, o) => sum + (new Date(o.actedAt) - new Date(o.createdAt)), 0) / (actedOn || 1);

        res.status(200).json({
            success: true,
            stats: {
                totalAlerts,
                actedOn,
                responseRate: totalAlerts ? Math.round((actedOn / totalAlerts) * 100) : 0,
                avgResponseMinutes: actedOn ? Math.round(avgResponseMs / 60000) : null,
                followUpsLogged: withFollowUp.length,
                positiveOutcomeRate: withFollowUp.length
                    ? Math.round((positive / withFollowUp.length) * 100)
                    : null,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- GET all outcomes for a patient (for reporting/dashboard later) ---
const getPatientOutcomes = async (req, res) => {
    try {
        const patientId = req.linkedPatientId;
        const outcomes = await SessionOutcome.find({ patientId })
            .populate('memoryId', 'photoUrl generatedStory familyNote category')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, outcomes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    warmupEmotionService,
    captureEmotion,
    logEmotionReading,
    finalizeSession,
    getPatientOutcomes,
    acknowledgeAlert,
    recordAction,
    recordFollowUp,
    getEngagementStats,
};