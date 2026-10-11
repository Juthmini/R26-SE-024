const dotenv = require("dotenv");

dotenv.config();

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || "",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  // fal.ai (https://fal.ai) - renders real, clean game images on demand. FLUX
  // schnell is fast, concurrent and cheap. Set FAL_KEY in the environment.
  falApiKey: process.env.FAL_KEY || process.env.FAL_API_KEY || "",
  falModel: process.env.FAL_MODEL || "fal-ai/flux/schnell",
};

if (!config.mongoUri) {
  // Keep fail-fast to avoid silent runtime issues.
  console.warn("MONGO_URI is not set in environment variables.");
}

module.exports = config;
