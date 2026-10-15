// A small Express app that mounts the REAL caregiver routes exactly like your
// index.js does (same URLs). Your index.js is not modified or imported.
const express = require('express');
const authRoutes = require('../../../src/routes/auth/authRoutes');
const protectedRoutes = require('../../../src/routes/auth/protectedRoutes');
const taskRoutes = require('../../../src/routes/caregiver/taskRoutes');
const patientRoutes = require('../../../src/routes/caregiver/patientRoutes');
const insightRoutes = require('../../../src/routes/caregiver/insightRoutes');
const notificationRoutes = require('../../../src/routes/caregiver/Notificationroutes');
const llmRoutes = require('../../../src/routes/caregiver/llmRoutes');
const { notFoundHandler, errorHandler } = require('../../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/caregiver/tasks', taskRoutes);
app.use('/api/caregiver/patients', patientRoutes);
app.use('/api/caregiver/insights', insightRoutes);
app.use('/api/caregiver/notifications', notificationRoutes);
app.use('/api/caregiver/ai-coach', llmRoutes);
app.use('/api', protectedRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
