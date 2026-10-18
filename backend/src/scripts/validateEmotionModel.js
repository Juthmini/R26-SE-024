// Standalone validation harness for the facial-expression classifier used
// in src/services/emotion/faceEmotionDetector.js — this calls the EXACT
// same function the live app uses (not a re-implementation), so the
// accuracy this reports is the real accuracy of the deployed system, not
// a theoretical one.
//
// HOW TO USE:
// 1. Put labeled photos in backend/validation-photos/. Name each file
//    "<trueLabel>_<anything>.jpg", e.g. happy_01.jpg, sad_volunteer2.jpg,
//    neutral_03.jpg. Valid labels: happy, sad, angry, surprise, fear,
//    disgust, neutral (must match EmotionLog's enum exactly).
// 2. Run:  node src/scripts/validateEmotionModel.js
// 3. Read the printed report, and the saved copy at
//    backend/validation-results.md — both the raw numbers and the
//    confusion matrix are meant to be dropped straight into a thesis
//    results section.
//
// Photos themselves are never read by this script's output or committed
// anywhere — only aggregate counts/percentages are printed and saved.
// The validation-photos/ folder is gitignored; keep it that way, since it
// holds real people's faces.

const fs = require('fs');
const path = require('path');
const { classifyEmotion } = require('../services/emotion/faceEmotionDetector');

const PHOTOS_DIR = path.join(__dirname, '../../validation-photos');
const REPORT_PATH = path.join(__dirname, '../../validation-results.md');
const VALID_LABELS = ['happy', 'sad', 'angry', 'surprise', 'fear', 'disgust', 'neutral'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

function parseTrueLabel(filename) {
  const prefix = filename.split(/[_\-.]/)[0].toLowerCase();
  return VALID_LABELS.includes(prefix) ? prefix : null;
}

function dominant(predictions) {
  return predictions.reduce((best, p) => (p.score > best.score ? p : best)).label;
}

async function main() {
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    console.log(`Created ${PHOTOS_DIR} — add labeled photos there and re-run.`);
    console.log(`Name each file "<label>_anything.jpg", label one of: ${VALID_LABELS.join(', ')}`);
    return;
  }

  const files = fs.readdirSync(PHOTOS_DIR).filter((f) =>
    IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())
  );

  if (files.length === 0) {
    console.log(`No images found in ${PHOTOS_DIR}.`);
    console.log(`Name each file "<label>_anything.jpg", label one of: ${VALID_LABELS.join(', ')}`);
    return;
  }

  const results = [];
  const skipped = [];

  for (const file of files) {
    const trueLabel = parseTrueLabel(file);
    if (!trueLabel) {
      skipped.push({ file, reason: 'filename prefix is not a recognized label' });
      continue;
    }

    const buffer = fs.readFileSync(path.join(PHOTOS_DIR, file));
    try {
      const predictions = await classifyEmotion(buffer);
      const predictedLabel = dominant(predictions);
      results.push({ file, trueLabel, predictedLabel, correct: predictedLabel === trueLabel });
      console.log(`${file}: true=${trueLabel} predicted=${predictedLabel} ${predictedLabel === trueLabel ? '✓' : '✗'}`);
    } catch (error) {
      skipped.push({ file, reason: error.noFaceDetected ? 'no face detected' : error.message });
      console.log(`${file}: SKIPPED (${skipped[skipped.length - 1].reason})`);
    }
  }

  if (results.length === 0) {
    console.log('\nNo images were successfully classified — nothing to report.');
    return;
  }

  const correct = results.filter((r) => r.correct).length;
  const accuracy = Math.round((correct / results.length) * 1000) / 10;

  // confusion matrix: rows = true label, columns = predicted label
  const labelsUsed = [...new Set(results.flatMap((r) => [r.trueLabel, r.predictedLabel]))].sort();
  const matrix = {};
  for (const t of labelsUsed) {
    matrix[t] = {};
    for (const p of labelsUsed) matrix[t][p] = 0;
  }
  for (const r of results) matrix[r.trueLabel][r.predictedLabel] += 1;

  const lines = [];
  lines.push('# Emotion Classifier Validation Results');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`**Overall accuracy: ${accuracy}%** (${correct}/${results.length} correct)`);
  if (skipped.length) lines.push(`${skipped.length} image(s) skipped: ${skipped.map((s) => `${s.file} (${s.reason})`).join(', ')}`);
  lines.push('');
  lines.push('## Confusion Matrix (rows = true label, columns = predicted)');
  lines.push('');
  lines.push(`| True \\ Predicted | ${labelsUsed.join(' | ')} |`);
  lines.push(`|---|${labelsUsed.map(() => '---').join('|')}|`);
  for (const t of labelsUsed) {
    lines.push(`| **${t}** | ${labelsUsed.map((p) => matrix[t][p]).join(' | ')} |`);
  }
  lines.push('');
  lines.push('## Per-image results');
  lines.push('');
  lines.push('| File | True | Predicted | Correct |');
  lines.push('|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.file} | ${r.trueLabel} | ${r.predictedLabel} | ${r.correct ? 'Yes' : 'No'} |`);
  }

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
  console.log(`\n=== ${accuracy}% accuracy (${correct}/${results.length}) ===`);
  console.log(`Full report with confusion matrix saved to: ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error('Validation run failed:', e);
  process.exit(1);
});
