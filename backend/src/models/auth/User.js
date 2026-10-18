const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // ── Core fields (all roles) 
    fullName: {
      type:     String,
      required: [true, 'Full name is required'],
      trim:     true,
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: 6,
      select:    false,
    },
    role: {
      type:     String,
      enum:     ['patient', 'caregiver', 'family'],
      required: [true, 'Role is required'],
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    refreshToken: {
      type:   String,
      select: false,
    },

    // ── Patient Step 1 fields 
    age:               { type: Number },
    gender:            { type: String },
    preferredLanguage: { type: String },
    cognitiveLevel:    { type: String },
    hometown:          { type: String },
    hobbies:           { type: [String], default: [] },
    interests:         { type: [String], default: [] },

    // ── Patient Step 2 fields 
    familyMembers: {
      type: [{
        id:       { type: String },
        name:     { type: String },
        photo:    { type: String },
        relation: { type: String },
      }],
      default: [],
    },
    lifeEvents: {
      type: [{
        id:    { type: String },
        title: { type: String },
      }],
      default: [],
    },
    countriesLived: { type: [String], default: [] },
    occupations:    { type: [String], default: [] },

    // ── Patient Step 3 fields 
    favoritePhotos: { type: [String], default: [] },
    favoritePlaces: { type: [String], default: [] },
    favoritePlacesText:  { type: String },
    festivalsCelebrated: { type: [String], default: [] },
    foodsPreferred: {
      type: [{
        id:   { type: String },
        name: { type: String },
      }],
      default: [],
    },
    preferredSports:     { type: [String], default: [] },
    preferredSportsText: { type: String },
    languagesPreferred:  { type: [String], default: [] },
    assignedCaregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Family extra fields
    // which patient's care record (caregiver/Patient.js) this family member
    // is linked to, resolved at registration from the patient's own email
    linkedPatientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
    },

    // ── Caregiver extra fields
    avatarColor:      { type: String, default: '#2563EB' },
    isOnline:         { type: Boolean, default: true },
    shiftsCompleted:  { type: Number,  default: 0 },
    patientsAssigned: { type: Number,  default: 0 },
    hoursThisWeek:    { type: Number,  default: 0 },
    profileImage:     { type: String },
  },
  { timestamps: true }
);

// ── Hash password on save ─────────────────────────────────────────────────
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ── Compare passwords ─────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
