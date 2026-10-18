const Memory = require('../../models/family/FamilyMemory');

// --- GET every memory a family member has created for the logged-in
//     patient — identity comes from req.resolvedPatientId (set by
//     resolveOwnPatientRecord), never from a client-supplied id ---
const getMyMemories = async (req, res) => {
  try {
    const memories = await Memory.find({ patientId: req.resolvedPatientId })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, memories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- PATCH play count for one of the patient's own memories ---
const incrementMyMemoryPlayCount = async (req, res) => {
  try {
    const existing = await Memory.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Memory not found' });
    }
    if (existing.patientId.toString() !== req.resolvedPatientId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this memory' });
    }

    const memory = await Memory.findByIdAndUpdate(
      req.params.id,
      { $inc: { playCount: 1 } },
      { new: true }
    );

    res.status(200).json({ success: true, memory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getMyMemories, incrementMyMemoryPlayCount };
