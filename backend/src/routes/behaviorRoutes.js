const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const axios = require('axios');
const mongoose = require('mongoose');
const BehaviorLog = require('../models/BehaviorLog');
const Patient = require('../models/Patient');
const ObjectLocation = require('../models/ObjectLocation');

const uploadDir = path.join(__dirname, '../../uploads/csv');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });
const AI_SERVICE_URL = 'http://localhost:8000';


// ─── Object Detection Proxy (mobile → backend:5000 → AI:8000) ─────────────────
router.post('/detect-objects', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file provided' });

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', require('fs').createReadStream(req.file.path), {
      filename: req.file.originalname || 'scan.jpg',
      contentType: req.file.mimetype || 'image/jpeg'
    });

    const aiRes = await axios.post(`${AI_SERVICE_URL}/detect`, form, {
      headers: form.getHeaders(),
      timeout: 20000
    });

    require('fs').unlinkSync(req.file.path);
    res.json({ success: true, ...aiRes.data });
  } catch (err) {
    if (req.file?.path) try { require('fs').unlinkSync(req.file.path); } catch {}
    res.status(500).json({
      success: false,
      error: `AI service unreachable: ${err.message}`
    });
  }
});


router.post('/bulk-upload', upload.single('file'), async (req, res) => {
  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      quote: '"'
    });

    const results = { success: [], errors: [], duplicates: [], total: records.length };

    // Get all registered patients keyed by customerCode
    const patients = await Patient.find({});
    const patientMap = {};
    patients.forEach(p => { patientMap[p.customerCode] = p._id; });

    // Build a set of existing records in DB: "patientId|date|time"
    const existingKeys = new Set();
    const allExisting = await BehaviorLog.find({}, { patientId: 1, date: 1, time: 1 }).lean();
    allExisting.forEach(e => existingKeys.add(`${e.patientId}|${e.date}|${e.time}`));

    // Track duplicates within this CSV upload
    const csvKeys = new Set();

    const logsToInsert = [];

    for (const row of records) {
      const pid = row.patientId?.trim();

      // 1. Check patient is registered
      if (!patientMap[pid]) {
        results.errors.push({ row: `${pid} @ ${row.date} ${row.time}`, reason: 'Patient not registered in system' });
        continue;
      }

      const mongoId = patientMap[pid];
      const dedupKey = `${mongoId}|${row.date}|${row.time}`;

      // 2. Check duplicate within this CSV
      if (csvKeys.has(dedupKey)) {
        results.duplicates.push({ row: `${pid} @ ${row.date} ${row.time}`, reason: 'Duplicate within uploaded CSV' });
        continue;
      }

      // 3. Check duplicate already in DB
      if (existingKeys.has(dedupKey)) {
        results.duplicates.push({ row: `${pid} @ ${row.date} ${row.time}`, reason: 'Already exists in database' });
        continue;
      }

      csvKeys.add(dedupKey);

      const dt = new Date(`${row.date}T${row.time}:00`);
      logsToInsert.push({
        patientId: mongoId,
        date: row.date,
        time: row.time,
        hour: dt.getHours(),
        dayOfWeek: dt.getDay(),
        activity: row.activity?.toLowerCase().trim(),
        duration: parseInt(row.duration_minutes) || 0,
        location: row.location || '',
        notes: row.notes || '',
        source: 'csv'
      });
      results.success.push(`${pid} @ ${row.date} ${row.time}`);
    }

    if (logsToInsert.length > 0) {
      await BehaviorLog.insertMany(logsToInsert);
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `${logsToInsert.length} records imported, ${results.duplicates.length} duplicates skipped, ${results.errors.length} invalid`,
      results
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ─── Trigger LSTM Training for a Patient ──────────────────────────
router.post('/train/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const logs = await BehaviorLog.find({ patientId }).lean();

    if (logs.length < 10) {
      return res.status(400).json({ success: false, message: 'Need at least 10 behavior logs to train' });
    }

    // Send logs to AI service for training
    const aiRes = await axios.post(`${AI_SERVICE_URL}/train-behavior`, {
      patientId,
      logs: logs.map(l => ({
        hour: l.hour,
        dayOfWeek: l.dayOfWeek,
        activity: l.activity,
        duration: l.duration
      }))
    });

    res.json({ success: true, message: 'Model trained successfully', result: aiRes.data });
  } catch (err) {
    console.error('Training error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Pattern / Voice Alert for Patient ────────────────────────
router.get('/pattern/:patientId', async (req, res) => {
  try {
    const aiRes = await axios.get(`${AI_SERVICE_URL}/behavior-pattern/${req.params.patientId}`);
    res.json({ success: true, data: aiRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Logs for a Patient ───────────────────────────────────────
router.get('/logs/:patientId', async (req, res) => {
  try {
    const logs = await BehaviorLog.find({ patientId: req.params.patientId }).sort({ date: -1, time: -1 }).limit(200);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Mobile: Log real-time event ─────────────────────────────────
router.post('/log-event', async (req, res) => {
  try {
    const { patientId, activity, location, duration } = req.body;
    const now = new Date();
    const log = await BehaviorLog.create({
      patientId,
      date: now.toISOString().split('T')[0],
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      activity, location, duration: duration || 0,
      source: 'mobile'
    });
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Mobile: Get voice alert for current time ─────────────────────
router.post('/voice-alert', async (req, res) => {
  try {
    const { patientId } = req.body;
    const patient = await Patient.findById(patientId);
    const now = new Date();
    
    const aiRes = await axios.post(`${AI_SERVICE_URL}/predict-alert`, {
      patientId,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      patientName: patient?.firstName || 'Patient'
    });

    res.json({ success: true, alert: aiRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Mobile Patient Login ─────────────────────────────────────────
router.post('/mobile-login', async (req, res) => {
  try {
    const { registrationNumber } = req.body;
    const patient = await Patient.findOne({ customerCode: registrationNumber });
    if (patient) {
      return res.json({
        success: true,
        patient: {
          id: patient._id,
          name: `${patient.firstName} ${patient.lastName}`,
          firstName: patient.firstName,
          customerCode: patient.customerCode,
          patientImage: patient.patientImage
        }
      });
    }

    // Fallback: patients registered through the caregiver app (a different
    // model/collection - see src/models/caregiver/Patient.js) have no
    // customerCode field at all, but the admin dashboard displays them with
    // a synthesized "EXT-<last 6 hex of _id>" code (see PatientController.js
    // getAllPatients). Accept that same code here so those patients can log
    // into the mobile app too, instead of only ones registered via the
    // admin form.
    const code = String(registrationNumber || '').trim().toUpperCase();
    if (code.startsWith('EXT-')) {
      const suffix = code.slice(4);
      const CaregiverPatient = require('../models/caregiver/Patient');
      const candidates = await CaregiverPatient.find({});
      const match = candidates.find(
        (c) => String(c._id).slice(-6).toUpperCase() === suffix
      );
      if (match) {
        return res.json({
          success: true,
          patient: {
            id: match._id,
            name: match.name,
            firstName: match.name,
            customerCode: code,
            patientImage: null
          }
        });
      }
    }

    return res.status(404).json({ success: false, message: 'Patient not registered in the system' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Face Recognition Registration (Enroll Face) ──────────────────
router.post('/register-face', upload.single('file'), async (req, res) => {
  try {
    const { patientId, customerCode } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No face image provided' });
    }

    let patient = null;
    if (patientId) patient = await Patient.findById(patientId);
    else if (customerCode) patient = await Patient.findOne({ customerCode });

    if (!patient) {
      if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname || 'face.jpg',
      contentType: req.file.mimetype || 'image/jpeg'
    });

    const aiRes = await axios.post(`${AI_SERVICE_URL}/extract-embedding`, form, {
      headers: form.getHeaders(),
      timeout: 25000
    });

    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}

    if (!aiRes.data || aiRes.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        error: aiRes.data?.message || 'Could not detect face clearly in image'
      });
    }

    patient.faceEmbedding = aiRes.data.embedding;
    patient.isFaceRegistered = true;
    await patient.save();

    res.json({
      success: true,
      message: 'Face registered successfully',
      patientId: patient._id
    });
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Face Recognition Login (Scan Face to Login) ──────────────────
router.post('/face-login', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No photo provided for face login' });
    }

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname || 'login.jpg',
      contentType: req.file.mimetype || 'image/jpeg'
    });

    const aiRes = await axios.post(`${AI_SERVICE_URL}/extract-embedding`, form, {
      headers: form.getHeaders(),
      timeout: 25000
    });

    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}

    if (!aiRes.data || aiRes.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Could not clearly detect a face. Please hold still and look at the camera.'
      });
    }

    // Find all patients with face embeddings registered
    const patients = await Patient.find({ isFaceRegistered: true, faceEmbedding: { $ne: null } });
    if (!patients || patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No face-registered patients found in database. Please register your face first.'
      });
    }

    const matchRes = await axios.post(`${AI_SERVICE_URL}/match-face`, {
      target_embedding: aiRes.data.embedding,
      known_patients: patients.map(p => ({
        patientId: p._id.toString(),
        embedding: p.faceEmbedding
      }))
    });

    if (matchRes.data?.status === 'match' && matchRes.data.patientId) {
      const patient = await Patient.findById(matchRes.data.patientId);
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Matched patient record not found.' });
      }
      return res.json({
        success: true,
        confidence: matchRes.data.confidence,
        patient: {
          id: patient._id,
          name: `${patient.firstName} ${patient.lastName}`,
          firstName: patient.firstName,
          customerCode: patient.customerCode,
          patientImage: patient.patientImage
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Face not recognized. Please try again or log in with your Registration Number.'
      });
    }
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Behavior Stats for Reports ───────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await BehaviorLog.aggregate([
      { $group: {
        _id: { patientId: '$patientId', activity: '$activity' },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' }
      }},
      { $lookup: { from: 'patientregistries', localField: '_id.patientId', foreignField: '_id', as: 'patient' }},
      { $project: {
        activity: '$_id.activity',
        patientName: { $concat: [{ $arrayElemAt: ['$patient.firstName', 0] }, ' ', { $arrayElemAt: ['$patient.lastName', 0] }] },
        count: 1, avgDuration: 1
      }}
    ]);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Haversine formula - returns distance in metres between two GPS points
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(metres) {
  if (metres < 5)   return { label: 'Right here', spoken: 'It is right here, very close to you' };
  if (metres < 20)  return { label: `${Math.round(metres)}m away`, spoken: `about ${Math.round(metres)} metres away` };
  if (metres < 100) return { label: `${Math.round(metres)}m away`, spoken: `approximately ${Math.round(metres)} metres away` };
  if (metres < 1000) return { label: `${Math.round(metres)}m away`, spoken: `about ${Math.round(metres)} metres away` };
  return { label: `${(metres / 1000).toFixed(1)}km away`, spoken: `about ${(metres / 1000).toFixed(1)} kilometres away` };
}

// ─── Save Object Location with GPS ─────────────────────────────────────────
// POST /api/admin/behavior/object-location
router.post('/object-location', async (req, res) => {
  try {
    const { patientId, objectName, roomLabel, locationDetail, lat, lng, confidence } = req.body;
    if (!patientId || !objectName) {
      return res.status(400).json({ success: false, error: 'patientId and objectName are required' });
    }

    const entry = await ObjectLocation.create({
      patientId,
      objectName: objectName.toLowerCase().trim(),
      roomLabel: roomLabel || 'Unknown',
      locationDetail: locationDetail || '',
      coordinates: {
        lat: lat != null ? parseFloat(lat) : null,
        lng: lng != null ? parseFloat(lng) : null,
      },
      confidence: confidence ? Math.round(parseFloat(confidence)) : 0,
      detectedBy: 'camera',
      detectedAt: new Date(),
    });

    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Find Last Known Location + Distance Navigation ────────────────────────────
// GET /api/admin/behavior/find-object/:patientId?q=toothbrush&lat=6.9&lng=79.8
router.get('/find-object/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const keyword  = (req.query.q   || '').toLowerCase().trim();
    const userLat  = req.query.lat  ? parseFloat(req.query.lat)  : null;
    const userLng  = req.query.lng  ? parseFloat(req.query.lng)  : null;

    if (!keyword) return res.status(400).json({ success: false, error: '?q= is required' });

    const record = await ObjectLocation.findOne({
      patientId: new mongoose.Types.ObjectId(patientId),
      objectName: { $regex: keyword, $options: 'i' },
    }).sort({ detectedAt: -1 });

    if (!record) {
      return res.json({
        success: true, found: false,
        message: `No location saved for "${keyword}" yet. Scan it with the camera first.`,
      });
    }

    // Time ago label
    const mins = Math.round((Date.now() - new Date(record.detectedAt).getTime()) / 60000);
    const timeLabel = mins < 60
      ? `${mins} minute${mins !== 1 ? 's' : ''} ago`
      : `${Math.round(mins / 60)} hour${Math.round(mins / 60) !== 1 ? 's' : ''} ago`;

    // Distance calculation
    let distanceMetres = null;
    let distanceLabel  = null;
    let distanceSpoken = null;
    const hasObjGPS  = record.coordinates?.lat != null && record.coordinates?.lng != null;
    const hasUserGPS = userLat != null && userLng != null;

    if (hasObjGPS && hasUserGPS) {
      distanceMetres = Math.round(haversineMetres(userLat, userLng, record.coordinates.lat, record.coordinates.lng));
      const fmt = formatDistance(distanceMetres);
      distanceLabel  = fmt.label;
      distanceSpoken = fmt.spoken;
    }

    // Build spoken navigation message
    const room   = record.roomLabel !== 'Unknown' ? ` in the ${record.roomLabel}` : '';
    const detail = record.locationDetail ? `, ${record.locationDetail}` : '';
    const dist   = distanceSpoken ? `. It is ${distanceSpoken}` : '';
    const spokenMessage = `Your ${record.objectName} was last seen${room}${detail}, ${timeLabel}${dist}. Go to your ${record.roomLabel} and look around carefully.`;

    res.json({
      success: true, found: true,
      objectName:    record.objectName,
      roomLabel:     record.roomLabel,
      locationDetail: record.locationDetail,
      coordinates:   record.coordinates,
      confidence:    record.confidence,
      detectedAt:    record.detectedAt,
      timeLabel,
      distanceMetres,
      distanceLabel,
      spokenMessage,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Object Location History ────────────────────────────────────────────────
router.get('/object-history/:patientId', async (req, res) => {
  try {
    const records = await ObjectLocation.find({
      patientId: new mongoose.Types.ObjectId(req.params.patientId),
    }).sort({ detectedAt: -1 }).limit(50);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
