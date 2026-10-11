const mongoose = require('mongoose');

const emotionLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    memoryId: {
      // which story was playing when this reading was taken
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMemory',
      required: true,
    },
    sessionId: {
      // groups all readings from one listening session together
      // (generated once when playback starts, reused for every 
      // reading during that same session)
      type: String,
      required: true,
    },
    secondsIntoPlayback: {
      // how far into the story this reading was taken
      // (0 = right at the start, useful for plotting the 
      // emotional arc over time later)
      type: Number,
      required: true,
    },
    dominantEmotion: {
      type: String,
      enum: ['happy', 'sad', 'angry', 'surprise', 'fear', 'disgust', 'neutral'],
      required: true,
    },
    emotionScores: {
      // full breakdown, not just the dominant one — 
      // useful for more nuanced analysis later
      happy: { type: Number, default: 0 },
      sad: { type: Number, default: 0 },
      angry: { type: Number, default: 0 },
      surprise: { type: Number, default: 0 },
      fear: { type: Number, default: 0 },
      disgust: { type: Number, default: 0 },
      neutral: { type: Number, default: 0 },
    },
    capturedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// index for fast lookup of all readings in one session
emotionLogSchema.index({ sessionId: 1, secondsIntoPlayback: 1 });

module.exports = mongoose.model('EmotionLog', emotionLogSchema);