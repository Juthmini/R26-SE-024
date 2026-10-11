const axios = require('axios');
const EmotionLog = require('../../models/family/EmotionLog');
const SessionOutcome = require('../../models/family/SessionOutcome');

// Hugging Face hosted model — replaces the custom Render-hosted service,
// which was crashing (500/502) on real webcam frames. This is a managed,
// pre-trained facial-expression classifier; its labels already match
// EmotionLog's enum (happy/sad/angry/surprise/fear/disgust/neutral).
const HF_MODEL_URL = 'https://router.huggingface.co/hf-inference/models/dima806/facial_emotions_image_detection';
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN;
const EMOTION_KEYS = ['happy', 'sad', 'angry', 'surprise', 'fear', 'disgust', 'neutral'];

// a real image, used to force the model to load during warmup
const WARMUP_IMAGE_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

// calls the HF inference endpoint; retries once if the model is still
// spinning up (HF returns 503 + estimated_time while it loads)
async function classifyEmotion(buffer) {
    try {
        const response = await axios.post(HF_MODEL_URL, buffer, {
            headers: {
                Authorization: `Bearer ${HF_TOKEN}`,
                'Content-Type': 'image/jpeg',
            },
            timeout: 30000,
        });
        return response.data;
    } catch (error) {
        const isLoading = error.response?.status === 503;
        if (!isLoading) throw error;

        const waitMs = Math.min((error.response.data?.estimated_time || 20) * 1000, 30000);
        console.log(`[emotion] HF model loading, retrying in ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        const response = await axios.post(HF_MODEL_URL, buffer, {
            headers: {
                Authorization: `Bearer ${HF_TOKEN}`,
                'Content-Type': 'image/jpeg',
            },
            timeout: 30000,
        });
        return response.data;
    }
}

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

// --- WARMUP — forces the HF model to load before real-time captures start.
//     Fire-and-forget: responds immediately, doesn't make the caller wait ---
const warmupEmotionService = (req, res) => {
    classifyEmotion(Buffer.from(WARMUP_IMAGE_BASE64, 'base64')).catch(() => {
        // don't care about the result — just want the model loaded
    });
    res.status(202).json({ success: true, message: 'Warmup ping sent' });
};

// --- CAPTURE — receives a photo from the app, forwards to
//     the deployed emotion detection service, logs the result ---
const captureEmotion = async (req, res) => {
    try {
        const {
            patientId,
            memoryId,
            sessionId,
            secondsIntoPlayback,
            photoBase64,
        } = req.body;

        if (!patientId || !memoryId || !sessionId || !photoBase64) {
            return res.status(400).json({
                success: false,
                message: 'patientId, memoryId, sessionId and photoBase64 are required',
            });
        }

        const buffer = Buffer.from(photoBase64, 'base64');
        console.log(`[emotion] captured frame: ${buffer.length} bytes, session ${sessionId}, t=${secondsIntoPlayback}s`);

        let predictions;
        try {
            predictions = await classifyEmotion(buffer);
        } catch (detectionError) {
            console.error(
                '[emotion] HF classification call failed:',
                detectionError.response
                    ? `status ${detectionError.response.status} — ${JSON.stringify(detectionError.response.data)}`
                    : detectionError.message
            );
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
            patientId,
            memoryId,
            sessionId,
            secondsIntoPlayback,
            dominantEmotion,
            emotionScores,
        } = req.body;

        if (!patientId || !memoryId || !sessionId || !dominantEmotion) {
            return res.status(400).json({
                success: false,
                message: 'patientId, memoryId, sessionId and dominantEmotion are required',
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

        const outcome = await SessionOutcome.findOneAndUpdate(
            { sessionId },
            {
                patientId: readings[0].patientId,
                memoryId: readings[0].memoryId,
                sessionId,
                baselineEmotion: firstReadings[0].dominantEmotion,
                peakEmotion: peakReading.dominantEmotion,
                finalEmotion: lastReadings[lastReadings.length - 1].dominantEmotion,
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

// --- GET all outcomes for a patient (for reporting/dashboard later) ---
const getPatientOutcomes = async (req, res) => {
    try {
        const { patientId } = req.params;
        const outcomes = await SessionOutcome.find({ patientId })
            .populate('memoryId', 'photoUrl generatedStory familyNote')
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
};