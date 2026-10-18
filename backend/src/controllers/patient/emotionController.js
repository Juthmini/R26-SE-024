const EmotionLog = require('../../models/family/EmotionLog');
const SessionOutcome = require('../../models/family/SessionOutcome');
const { classifyEmotion, ensureReady } = require('../../services/emotion/faceEmotionDetector');

// Same local, self-hosted classifier the family-side emotionController.js
// uses (see services/emotion/faceEmotionDetector.js) — deliberately
// duplicated controller logic rather than a shared controller, so an edit
// here can't affect the already-verified family pipeline; the detector
// module itself is the one genuinely shared, role-agnostic piece.
const EMOTION_KEYS = ['happy', 'sad', 'angry', 'surprise', 'fear', 'disgust', 'neutral'];

const VALENCE_WEIGHTS = {
    happy: 2,
    surprise: 1,
    neutral: 0,
    sad: -1,
    fear: -1,
    disgust: -1,
    angry: -2,
};

function calculatePositivity(emotionScores) {
    let score = 0;
    for (const [emotion, weight] of Object.entries(VALENCE_WEIGHTS)) {
        const confidence = emotionScores[emotion] || 0;
        score += (confidence / 100) * weight;
    }
    return score;
}

// --- WARMUP — loads the local model into memory ahead of real captures ---
const warmupEmotionService = (req, res) => {
    ensureReady().catch(() => {});
    res.status(202).json({ success: true, message: 'Warmup ping sent' });
};

// --- CAPTURE — identical logic to the family version, just scoped to the
//     logged-in patient's own resolved care record instead of a linked one ---
const captureEmotion = async (req, res) => {
    try {
        const { memoryId, sessionId, secondsIntoPlayback, photoBase64 } = req.body;
        const patientId = req.resolvedPatientId;

        if (!memoryId || !sessionId || !photoBase64) {
            return res.status(400).json({
                success: false,
                message: 'memoryId, sessionId and photoBase64 are required',
            });
        }

        const buffer = Buffer.from(photoBase64, 'base64');
        console.log(`[emotion/patient] captured frame: ${buffer.length} bytes, session ${sessionId}, t=${secondsIntoPlayback}s`);

        let predictions;
        try {
            predictions = await classifyEmotion(buffer);
        } catch (detectionError) {
            if (detectionError.noFaceDetected) {
                return res.status(200).json({ success: true, skipped: true, message: 'No face detected in frame' });
            }
            console.error('[emotion/patient] local classification failed:', detectionError.message);
            throw detectionError;
        }

        const emotionScores = Object.fromEntries(EMOTION_KEYS.map((k) => [k, 0]));
        let dominantEmotion = EMOTION_KEYS[0];
        let topScore = -1;
        for (const { label, score } of predictions) {
            const key = label.toLowerCase();
            if (!(key in emotionScores)) continue;
            emotionScores[key] = Math.round(score * 10000) / 100;
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

// --- LOG a single emotion reading directly (manual/testing use) ---
const logEmotionReading = async (req, res) => {
    try {
        const { memoryId, sessionId, secondsIntoPlayback, dominantEmotion, emotionScores } = req.body;
        const patientId = req.resolvedPatientId;

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

// --- FINALIZE — identical math to the family version ---
const finalizeSession = async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'sessionId is required' });
        }

        const readings = await EmotionLog.find({ sessionId }).sort({ secondsIntoPlayback: 1 });

        if (readings.length === 0) {
            return res.status(404).json({ success: false, message: 'No emotion readings found for this session' });
        }

        const firstReadings = readings.slice(0, Math.min(3, readings.length));
        const lastReadings = readings.slice(-Math.min(3, readings.length));

        const avgPositivity = (readingSet) => {
            const scores = readingSet.map((r) => calculatePositivity(r.emotionScores));
            return scores.reduce((sum, s) => sum + s, 0) / scores.length;
        };

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

        let peakReading = readings[0];
        let peakScore = calculatePositivity(readings[0].emotionScores);
        for (const r of readings) {
            const s = calculatePositivity(r.emotionScores);
            if (s > peakScore) {
                peakScore = s;
                peakReading = r;
            }
        }

        const ALERT_THRESHOLD = 1.0;
        const alertTriggered = moodLift >= ALERT_THRESHOLD;

        const emotionCounts = {};
        for (const r of readings) {
            emotionCounts[r.dominantEmotion] = (emotionCounts[r.dominantEmotion] || 0) + 1;
        }
        const mostFrequentEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0][0];

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
                playbackDurationSeconds: readings[readings.length - 1].secondsIntoPlayback,
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, outcome });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    warmupEmotionService,
    captureEmotion,
    logEmotionReading,
    finalizeSession,
};
