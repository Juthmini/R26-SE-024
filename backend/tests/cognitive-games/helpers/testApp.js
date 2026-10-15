// A small Express app that mounts the REAL brain-game routes at the same URL
// as index.js (/api/cognitive/games). index.js itself is not imported.
const express = require('express');
const gameRoutes = require('../../../src/routes/cognitive/gameSessionRoutes');
const { notFoundHandler, errorHandler } = require('../../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/cognitive/games', gameRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
