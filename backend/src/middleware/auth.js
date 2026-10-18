// /backend/src/middleware/auth.js

const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/auth/User');
const Patient = require('../models/caregiver/Patient');

// ✅ Verify JWT Token - Protects routes
const protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header: "Bearer <token>"
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check if user still exists and is active
    const user = await User.findById(decoded.userId).select('role fullName email isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists or is deactivated.',
      });
    }

    // Attach user to request
    req.user = {
      userId: user._id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
    });
  }
};

// ✅ Role Authorization - Restricts access by role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access forbidden. Role '${req.user.role}' is not allowed to access this resource.`,
      });
    }
    next();
  };
};

// ✅ Resolves the logged-in family user's linked patient — use after
// protect + authorize('family'). Attaches req.linkedPatientId so family
// routes derive the patient from the authenticated account, never from
// whatever the client sends.
const resolveLinkedPatient = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('linkedPatientId');
    if (!user || !user.linkedPatientId) {
      return res.status(403).json({
        success: false,
        message: 'No patient linked to this family account yet.',
      });
    }
    req.linkedPatientId = user.linkedPatientId;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while resolving linked patient.',
    });
  }
};

// ✅ Resolves the logged-in patient's own care record — use after
// protect + authorize('patient'). Attaches req.resolvedPatientId so
// patient-facing routes (e.g. due events) derive the care record from the
// authenticated account, never from a client-supplied id.
const resolveOwnPatientRecord = async (req, res, next) => {
  try {
    const record = await Patient.findOne({ registeredPatientId: req.user.userId });
    if (!record) {
      return res.status(404).json({
        success: false,
        code: 'NO_CARE_RECORD',
        message: "No caregiver has added you as a patient yet.",
      });
    }
    req.resolvedPatientId = record._id;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while resolving patient record.',
    });
  }
};

module.exports = { protect, authorize, resolveLinkedPatient, resolveOwnPatientRecord };
