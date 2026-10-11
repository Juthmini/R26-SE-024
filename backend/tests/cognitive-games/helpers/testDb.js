const mongoose = require('mongoose');

// A temporary in-memory MongoDB (mongodb-memory-server) is used by default, so
// the real Atlas database is NEVER touched. Set TEST_MONGO_URI to use another
// throw-away MongoDB instead.
let mongoServer;

const connectTestDB = async () => {
  if (process.env.TEST_MONGO_URI) {
    await mongoose.connect(`${process.env.TEST_MONGO_URI}${Date.now()}${Math.floor(Math.random() * 1e6)}`);
    return;
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
};

const closeTestDB = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
};

const clearTestDB = async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
};

module.exports = { connectTestDB, closeTestDB, clearTestDB };
