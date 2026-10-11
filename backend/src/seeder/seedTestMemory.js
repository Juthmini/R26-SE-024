require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Memory = require('../models/family/FamilyMemory');

const seed = async () => {
  await connectDB();

  const memory = await Memory.create({
    patientId: '6a8eb91cb3e48b7f1a6ccc06', // Margaret Hughes
    uploadedBy: new mongoose.Types.ObjectId(), // dummy placeholder ID — 
                                                 // fine for testing, doesn't 
                                                 // need to reference a real 
                                                 // Caregiver document
    photoUrl: 'https://via.placeholder.com/400x300.png?text=Test+Photo',
    familyNote: 'This is a test memory for emotion tracking development.',
    aiPhotoDescription: 'a birthday party photo, cake with candles',
    generatedStory:
      'Margaret, do you remember this happy day? A birthday party with cake and candles, everyone gathered together to celebrate.',
  });

  console.log('✅ Test memory created');
  console.log('memoryId:', memory._id.toString());

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});