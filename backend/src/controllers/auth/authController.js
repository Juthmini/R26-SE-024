const mongoose = require('mongoose');
const User = require('../../models/auth/User');
const Patient = require('../../models/caregiver/Patient');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../../utils/jwt');

const parseJsonArrayField = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to a clear 400 response below.
    }
  }

  const error = new Error(`${fieldName} must be an array.`);
  error.statusCode = 400;
  throw error;
};

const parseStringArrayField = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  const error = new Error(`${fieldName} must be an array or comma-separated string.`);
  error.statusCode = 400;
  throw error;
};

const normalizePatientRegistrationFields = (body) => ({
  familyMembers: parseJsonArrayField(body.familyMembers, 'familyMembers'),
  lifeEvents: parseJsonArrayField(body.lifeEvents, 'lifeEvents'),
  countriesLived: parseStringArrayField(body.countriesLived, 'countriesLived'),
  occupations: parseStringArrayField(body.occupations, 'occupations'),
  favoritePhotos: parseStringArrayField(body.favoritePhotos, 'favoritePhotos'),
  favoritePlaces: parseStringArrayField(body.favoritePlaces, 'favoritePlaces'),
  festivalsCelebrated: parseStringArrayField(body.festivalsCelebrated, 'festivalsCelebrated'),
  foodsPreferred: parseJsonArrayField(body.foodsPreferred, 'foodsPreferred'),
  preferredSports: parseStringArrayField(body.preferredSports, 'preferredSports'),
  languagesPreferred: parseStringArrayField(body.languagesPreferred, 'languagesPreferred'),
});

// ── REGISTER ──────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const {
      fullName, email, password, role,

      // Patient Step 1
      age, gender, preferredLanguage,
      cognitiveLevel, hometown,
      hobbies, interests,

      // Patient Step 2
      familyMembers, lifeEvents,
      countriesLived, occupations,

      // Patient Step 3
      favoritePlaces, favoritePlacesText,
      festivalsCelebrated, foodsPreferred,
      preferredSports, preferredSportsText,
      languagesPreferred, assignedCaregiverId,

      // Family registration
      patientEmail,
    } = req.body;

    // Validate role
    const validRoles = ['patient', 'caregiver', 'family'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be patient, caregiver, or family.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered.',
      });
    }

    // Family registration: resolve the patient's email to their care record
    // *before* creating the account, so a bad email never leaves a dangling
    // family user with nothing to link to.
    let linkedPatientId = null;
    if (role === 'family') {
      if (!patientEmail) {
        return res.status(400).json({
          success: false,
          message: 'Patient email is required.',
        });
      }

      const patientUser = await User.findOne({
        email: patientEmail.trim().toLowerCase(),
        role: 'patient',
      });
      if (!patientUser) {
        return res.status(400).json({
          success: false,
          message: 'No patient account found with that email.',
        });
      }

      const careRecord = await Patient.findOne({ registeredPatientId: patientUser._id });
      if (!careRecord) {
        return res.status(400).json({
          success: false,
          message: "This patient hasn't been added by a caregiver yet.",
        });
      }

      linkedPatientId = careRecord._id;
    }

    const emptyPatientFields = {
      familyMembers: [],
      lifeEvents: [],
      countriesLived: [],
      occupations: [],
      favoritePlaces: [],
      favoritePhotos: [],
      festivalsCelebrated: [],
      foodsPreferred: [],
      preferredSports: [],
      languagesPreferred: [],
    };
    const patientFields =
      role === 'patient'
        ? normalizePatientRegistrationFields(req.body)
        : emptyPatientFields;

    // Create user with all fields
    const user = await User.create({
      fullName, email, password, role,

      // Step 1
      age, gender, preferredLanguage,
      cognitiveLevel, hometown,
      hobbies, interests,

      // Step 2
      familyMembers: patientFields.familyMembers,
      lifeEvents: patientFields.lifeEvents,
      countriesLived: patientFields.countriesLived,
      occupations: patientFields.occupations,

      // Step 3
      favoritePlaces: patientFields.favoritePlaces,
      favoritePhotos: patientFields.favoritePhotos,
      favoritePlacesText,
      festivalsCelebrated: patientFields.festivalsCelebrated,
      foodsPreferred: patientFields.foodsPreferred,
      preferredSports: patientFields.preferredSports,
      preferredSportsText,
      languagesPreferred: patientFields.languagesPreferred,
      assignedCaregiverId: role === 'patient' ? assignedCaregiverId || null : null,
      linkedPatientId,
    });

    // Generate tokens
    const accessToken  = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        user: {
          id:       user._id,
          fullName: user.fullName,
          email:    user.email,
          role:     user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Server error during registration.',
      error: error.message,
    });
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email }).select('+password +refreshToken');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Contact support.',
      });
    }

    const accessToken  = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Patients log in with email+password against THIS User record, but the
    // features that actually store per-patient data (Personal Vault, Find My
    // Things, routines, medications) all key off the separate caregiver
    // "Patient" model instead (see src/models/caregiver/Patient.js -
    // registeredPatientId links a caregiver Patient record back to this
    // User). Without resolving that link at login time, a patient could log
    // in successfully but the app would have no valid ID for any of those
    // features to use.
    let linkedPatient = null;
    if (user.role === 'patient') {
      const CaregiverPatient = require('../../models/caregiver/Patient');
      const match = await CaregiverPatient.findOne({ registeredPatientId: user._id });
      if (match) {
        linkedPatient = {
          id: match._id,
          firstName: match.name,
          customerCode: `EXT-${String(match._id).slice(-6).toUpperCase()}`,
        };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id:       user._id,
          fullName: user.fullName,
          email:    user.email,
          role:     user.role,
        },
        linkedPatient,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required.',
      });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user    = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }

    const newAccessToken = generateAccessToken(user._id, user.role);

    res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token.',
    });
  }
};

// ── LOGOUT ────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { refreshToken: null });
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during logout.',
    });
  }
};

// ── GET CURRENT USER ──────────────────────────────────────────────────────
const mapFamilyMemberSummary = (member) => ({
  id: member.id,
  name: member.name,
  relation: member.relation,
});

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      'fullName email role ' +
      'age gender preferredLanguage cognitiveLevel hometown hobbies interests ' +
      'familyMembers.id familyMembers.name familyMembers.relation lifeEvents countriesLived occupations ' +
      'favoritePlaces favoritePlacesText festivalsCelebrated foodsPreferred preferredSports preferredSportsText languagesPreferred assignedCaregiverId ' +
      'avatarColor isOnline shiftsCompleted patientsAssigned hoursThisWeek'
    );

    const fallbackCaregiver =
      user.role === 'patient' && !user.assignedCaregiverId
        ? await User.findOne({ role: 'caregiver', isActive: true }).select('_id')
        : null;

    const assignedCaregiverId =
      user.assignedCaregiverId || fallbackCaregiver?._id || null;

    res.status(200).json({
      success: true,
      data: {
        user: {
          id:       user._id,
          fullName: user.fullName,
          email:    user.email,
          role:     user.role,

          // Patient Step 1
          age:               user.age,
          gender:            user.gender,
          preferredLanguage: user.preferredLanguage,
          cognitiveLevel:    user.cognitiveLevel,
          hometown:          user.hometown,
          hobbies:           user.hobbies,
          interests:         user.interests,

          // Patient Step 2. Photos are intentionally omitted from /me.
          familyMembers:  (user.familyMembers || []).map(mapFamilyMemberSummary),
          lifeEvents:     user.lifeEvents,
          countriesLived: user.countriesLived,
          occupations:    user.occupations,

          // Patient Step 3. Favorite photos are served by /auth/me/photos.
          favoritePlaces:      user.favoritePlaces,
          favoritePlacesText:  user.favoritePlacesText,
          festivalsCelebrated: user.festivalsCelebrated,
          foodsPreferred:      user.foodsPreferred,
          preferredSports:     user.preferredSports,
          preferredSportsText: user.preferredSportsText,
          languagesPreferred:  user.languagesPreferred,
          assignedCaregiverId,

          // Caregiver
          avatarColor:      user.avatarColor,
          isOnline:         user.isOnline,
          shiftsCompleted:  user.shiftsCompleted,
          patientsAssigned: user.patientsAssigned,
          hoursThisWeek:    user.hoursThisWeek,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── UPDATE ME (patient edits their own registration details) ────────────────
// Scalar fields the owner may edit. Email, password and role are intentionally
// excluded — those are account/credential changes, not profile details.
const EDITABLE_SCALAR_FIELDS = [
  'fullName',
  'age',
  'gender',
  'preferredLanguage',
  'hometown',
  'favoritePlacesText',
  'preferredSportsText',
];

// Structured / array fields, parsed exactly like registration.
const EDITABLE_ARRAY_PARSERS = {
  familyMembers: (v) => parseJsonArrayField(v, 'familyMembers'),
  lifeEvents: (v) => parseJsonArrayField(v, 'lifeEvents'),
  countriesLived: (v) => parseStringArrayField(v, 'countriesLived'),
  occupations: (v) => parseStringArrayField(v, 'occupations'),
  favoritePhotos: (v) => parseStringArrayField(v, 'favoritePhotos'),
  favoritePlaces: (v) => parseStringArrayField(v, 'favoritePlaces'),
  festivalsCelebrated: (v) => parseStringArrayField(v, 'festivalsCelebrated'),
  foodsPreferred: (v) => parseJsonArrayField(v, 'foodsPreferred'),
  preferredSports: (v) => parseStringArrayField(v, 'preferredSports'),
  languagesPreferred: (v) => parseStringArrayField(v, 'languagesPreferred'),
};

const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Only apply fields that were actually sent, so a partial update never
    // wipes data the client didn't touch.
    for (const field of EDITABLE_SCALAR_FIELDS) {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    }

    for (const [field, parse] of Object.entries(EDITABLE_ARRAY_PARSERS)) {
      if (req.body[field] !== undefined) {
        user[field] = parse(req.body[field]);
      }
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res
      .status(status)
      .json({ success: false, message: error.message || 'Server error.' });
  }
};

const toPhotoPayload = (user) => ({
  familyMembers: user?.familyMembers || [],
  favoritePhotos: user?.favoritePhotos || [],
  profileImage: user?.profileImage,
});

const canAccessPatientPhotos = (requestUser, patient) => {
  if (requestUser.role === 'patient') {
    return requestUser.userId.toString() === patient._id.toString();
  }

  if (requestUser.role === 'caregiver') {
    return patient.assignedCaregiverId?.toString() === requestUser.userId.toString();
  }

  return false;
};

const getMePhotos = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      'familyMembers favoritePhotos profileImage'
    );

    res.status(200).json({
      success: true,
      data: {
        photos: toPhotoPayload(user),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getPatientPhotos = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patient id.' });
    }

    const patient = await User.findOne({ _id: patientId, role: 'patient' }).select(
      'familyMembers favoritePhotos profileImage assignedCaregiverId'
    );

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    if (!canAccessPatientPhotos(req.user, patient)) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to access this patient\'s photos.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        photos: toPhotoPayload(patient),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { register, login, refresh, logout, getMe, updateMe, getMePhotos, getPatientPhotos };



