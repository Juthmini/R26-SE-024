const mongoose = require('mongoose');

const familyEventSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      enum: ['birthday', 'anniversary', 'festival', 'religious', 'other'],
      default: 'other',
    },
    personName: {
      type: String,
      default: '',
    },
    relation: {
      type: String,
      default: '',
    },
    eventDate: {
      type: Date,
      required: true,
    },
    eventTime: {
      // stored as 24-hour "HH:mm" (validated on the frontend); display
      // formatting to 12-hour happens client-side. scheduledAt below is
      // the real comparison value derived from this.
      type: String,
      default: '',
    },
    scheduledAt: {
      // eventDate's calendar day combined with eventTime's hours/minutes —
      // the actual instant "due" checks compare against. Optional (not
      // required) so pre-existing events created before this field existed
      // never fail validation; getDueEvents treats a missing value as
      // "due immediately", matching their old behavior.
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      default: 'Asia/Colombo',
    },
    note: {
      type: String,
      maxlength: 200,
      default: '',
    },
    photoUrl: {
      type: String,
      default: '',
    },
    sensitive: {
      type: Boolean,
      default: false,
    },
    cardText: {
      // plain-template sentence by default; may be replaced by a
      // best-effort AI call when useAiCardText is requested (see
      // cardTextSource below for which one actually happened)
      type: String,
      default: '',
    },
    cardTextSource: {
      // 'ai' only when the opt-in AI call actually succeeded — never set
      // optimistically, so the UI never implies AI involvement that didn't
      // happen
      type: String,
      enum: ['template', 'ai'],
      default: 'template',
    },
    theme: {
      // 'calm' when sensitive is true, otherwise mirrors eventType
      type: String,
      default: 'other',
    },
    status: {
      type: String,
      enum: ['scheduled', 'shown', 'completed', 'snoozed', 'missed'],
      default: 'scheduled',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FamilyEvent', familyEventSchema);
