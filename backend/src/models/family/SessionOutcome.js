const mongoose = require('mongoose');

const sessionOutcomeSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    memoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMemory',
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    baselineEmotion: {
      // dominant emotion from the FIRST reading in the session
      type: String,
    },
    peakEmotion: {
      // the most positive emotion detected at any point 
      // during the session
      type: String,
    },
    finalEmotion: {
      // dominant emotion from the LAST reading in the session
      type: String,
    },
    moodLift: {
      // calculated score: positive = improved mood, 
      // negative = mood declined during the story
      // (exact calculation logic goes in the controller, 
      // not the schema — schema just stores the result)
      type: Number,
      default: 0,
    },
    totalReadings: {
      type: Number,
      default: 0,
    },
    // real 0-100 confidence percentages, averaged across the baseline vs
    // final readings — what the family dashboard's mood-shift card displays
    sadBeforePercent: {
      type: Number,
      default: 0,
    },
    happyBeforePercent: {
      type: Number,
      default: 0,
    },
    happyAfterPercent: {
      type: Number,
      default: 0,
    },
    moodShiftPercent: {
      // happyAfterPercent - happyBeforePercent
      type: Number,
      default: 0,
    },
    alertTriggered: {
      type: Boolean,
      default: false,
    },
    playbackDurationSeconds: {
      type: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SessionOutcome', sessionOutcomeSchema);