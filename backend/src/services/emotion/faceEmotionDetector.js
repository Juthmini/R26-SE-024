// Local, self-hosted facial-expression classifier — replaces the Hugging
// Face Inference Providers call, which now requires paid credits/PRO even
// for a single call (confirmed directly against their API: 402
// PrepaidCreditsRequired, same result on a brand-new account). This runs
// entirely in-process: no external API, no network call, no monthly cost,
// no uptime dependency on a third party. Models are the ones bundled with
// @vladmandic/face-api itself (loaded from node_modules, not downloaded),
// and tfjs runs on the WASM backend — deliberately NOT @tensorflow/tfjs-node,
// which has no prebuilt binary for current Node versions on Windows and
// requires a full native compiler toolchain to build from source.
const path = require('path');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const { Canvas, Image, ImageData, loadImage } = require('canvas');

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODEL_PATH = path.join(__dirname, '../../../node_modules/@vladmandic/face-api/model');

// face-api's expression labels vs. this codebase's existing EMOTION_KEYS —
// only the spelling differs, the three renamed below plus a straight pass
// for the rest (happy/sad/angry/neutral already match)
const LABEL_MAP = {
  fearful: 'fear',
  disgusted: 'disgust',
  surprised: 'surprise',
};

let readyPromise = null;

// idempotent: safe to call from every request, only does real work once
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await faceapi.tf.setBackend('wasm');
      await faceapi.tf.ready();
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH);
      await faceapi.nets.faceExpressionNet.loadFromDisk(MODEL_PATH);
    })();
  }
  return readyPromise;
}

// mirrors the shape the old Hugging Face response had — [{ label, score }]
// with score 0-1 — so the callers' existing mapping/dominant-emotion logic
// needs no changes beyond swapping which function they call.
async function classifyEmotion(buffer) {
  await ensureReady();

  const img = await loadImage(buffer);
  const canvas = new Canvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);

  const result = await faceapi
    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
    .withFaceExpressions();

  if (!result) {
    const error = new Error('No face detected in frame');
    error.noFaceDetected = true;
    throw error;
  }

  return Object.entries(result.expressions).map(([label, score]) => ({
    label: LABEL_MAP[label] || label,
    score,
  }));
}

module.exports = { classifyEmotion, ensureReady };
