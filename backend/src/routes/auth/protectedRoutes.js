// // /backend/src/routes/auth/protectedRoutes.js

// const express = require('express');
// const router = express.Router();
// const User = require('../models/auth/User');

// // ✅ Going up 2 levels from routes/auth/ to reach src/middleware/
// const { protect, authorize } = require('../../middleware/auth');

// router.get('/patient/dashboard', protect, authorize('patient'), (req, res) => {
//   res.json({ success: true, message: 'Patient Dashboard', user: req.user });
// });

// router.get('/caregiver/dashboard', protect, authorize('caregiver'), (req, res) => {
//   res.json({ success: true, message: 'Caregiver Dashboard', user: req.user });
// });

// router.get('/family/dashboard', protect, authorize('family'), (req, res) => {
//   res.json({ success: true, message: 'Family Dashboard', user: req.user });
// });

// router.get('/patients/registered',
//   protect,
//   authorize('caregiver'),
//   async (req, res) => {
//     try {
//       const patients = await User.find({ role: 'patient' })
//         .select('fullName email _id')
//         .sort({ fullName: 1 });

//       res.status(200).json({
//         success: true,
//         patients: patients.map(p => ({
//           id: p._id,
//           fullName: p.fullName,
//           email: p.email,
//         })),
//       });
//     } catch (error) {
//       res.status(500).json({ success: false, message: error.message });
//     }
//   }
// );

// module.exports = router;

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const User = require('../../models/auth/User');
const Patient = require('../../models/caregiver/Patient');

// ✅ Only PATIENTS can access
router.get('/patient/dashboard',
  protect,
  authorize('patient'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Welcome to Patient Dashboard',
      user: req.user,
    });
  }
);

// ✅ Only CAREGIVERS can access
router.get('/caregiver/dashboard',
  protect,
  authorize('caregiver'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Welcome to Caregiver Dashboard',
      user: req.user,
    });
  }
);

// ✅ Only FAMILY can access
router.get('/family/dashboard',
  protect,
  authorize('family'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Welcome to Family Dashboard',
      user: req.user,
    });
  }
);

// ✅ Get all registered patients - for caregivers to see
router.get('/patients/registered',
  protect,
  authorize('caregiver'),
  async (req, res) => {
    try {
      const alreadyAdded = await Patient.distinct('registeredPatientId', {
        registeredPatientId: { $ne: null },
      });
      

      const patients = await User.find({ role: 'patient', _id: { $nin: alreadyAdded } })
        .select('fullName email _id')
        .sort({ fullName: 1 });

      res.status(200).json({
        success: true,
        patients: patients.map(p => ({
          id: p._id,
          fullName: p.fullName,
          email: p.email,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;