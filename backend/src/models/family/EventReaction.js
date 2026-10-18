const mongoose = require('mongoose');

const eventReactionSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyEvent',
      required: true,
    },
    patientId: {
      // kept redundantly here (not just reachable via `event`) so ownership
      // checks follow the same x.patientId.toString() !== req.linkedPatientId
      // idiom used everywhere else in the family module
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    type: {
      type: String,
      enum: ['emoji', 'voice', 'video', 'skipped'],
      required: true,
    },
    emoji: {
      type: String,
      enum: ['happy', 'calm', 'sad', null],
      default: null,
    },
    mediaUrl: {
      type: String,
      default: '',
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    seenByFamilyAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EventReaction', eventReactionSchema);
