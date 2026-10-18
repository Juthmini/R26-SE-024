const express = require('express');
const router = express.Router();

const { protect, authorize, resolveLinkedPatient } = require('../../middleware/auth');
const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  getReactions,
  markReactionSeen,
  getBestTime,
} = require('../../controllers/family/eventController');
const {
  getEventSettings,
  updateEventSettings,
} = require('../../controllers/family/eventSettingsController');

// every route here requires a logged-in family account linked to a patient —
// patientId is derived from req.linkedPatientId in the controllers below,
// never trusted from the URL/body
router.use(protect, authorize('family'), resolveLinkedPatient);

router.post('/', createEvent);
router.get('/', getEvents);

// literal routes before /:id so "settings"/"best-time" are never mistaken
// for an event id by the generic routes below
router.get('/settings', getEventSettings);
router.put('/settings', updateEventSettings);
router.get('/best-time', getBestTime);

router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);
router.get('/:id/reactions', getReactions);
router.patch('/:id/reactions/:reactionId/seen', markReactionSeen);

module.exports = router;
