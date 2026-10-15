require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./src/config/db");

// Routes from dev
const medicationRoutes = require("./src/routes/caregiver/medicationRoutes");
const taskRoutes = require("./src/routes/caregiver/taskRoutes");
const patientRoutes = require("./src/routes/caregiver/patientRoutes");
const caregiverRoutes = require("./src/routes/caregiver/caregiverRoutes");
const cognitiveRoutes = require("./src/routes/cognitive");
const gameRoutes = require("./src/routes/cognitive/gameSessionRoutes");
const insightRoutes = require("./src/routes/caregiver/insightRoutes");
const protectedRoutes = require("./src/routes/auth/protectedRoutes");
const authRoutes = require("./src/routes/auth/authRoutes");
const cognitivePatientRoutes = require("./src/routes/cognitive/patientRoutes");
const recommendationRoutes = require('./src/routes/caregiver/recommendationRoutes');
const { notFoundHandler, errorHandler } = require("./src/middleware/errorHandler");
const notificationRoutes = require("./src/routes/caregiver/Notificationroutes");
const reportRoutes = require("./src/routes/caregiver/Reportroutes");
const llmRoutes = require("./src/routes/caregiver/llmRoutes"); 


const memoryRoutes = require("./src/routes/family/memoryRoutes");
const familyProfileRoutes = require("./src/routes/family/profileRoutes");
const emotionRoutes = require("./src/routes/family/emotionRoutes");

// Routes from HEAD
const lifeLoggingRoutes = require('./src/routes/life-logging-memory-vault');
const adminPatientRoutes = require('./src/routes/patientRoutes');
const behaviorRoutes = require('./src/routes/behaviorRoutes');
const personalObjectRoutes = require('./src/routes/personalObjectRoutes');

connectDB();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));
app.use(cors());

// Training Progress Simulation Endpoint (from HEAD)
app.post('/api/admin/train/:patientId', (req, res) => {
  const { patientId } = req.params;
  let percentage = 0;
  
  const interval = setInterval(() => {
    percentage += Math.floor(Math.random() * 15) + 5;
    if (percentage >= 100) {
      percentage = 100;
      io.emit('training_progress', { patientId, percentage });
      clearInterval(interval);
    } else {
      io.emit('training_progress', { patientId, percentage });
    }
  }, 1000);

  res.json({ success: true, message: "Training started" });
});

// Auth Routes
app.use("/api/auth", authRoutes);

// Caregiver Portal routes ...
app.use("/api/caregiver/tasks", taskRoutes);
app.use("/api/caregiver/patients", patientRoutes);
app.use("/api/caregiver/profile", caregiverRoutes);
app.use("/api/caregiver/insights", insightRoutes);
app.use("/api/caregiver/medications", medicationRoutes);
app.use('/api/caregiver/recommendations', recommendationRoutes);
app.use("/api/caregiver/notifications", notificationRoutes);
app.use("/api/caregiver/reports", reportRoutes);
app.use("/api/caregiver/ai-coach", llmRoutes); 
// Cognitive Assessment routes
app.use("/api/cognitive", cognitiveRoutes);

// Other API routes (from HEAD & dev)
app.use("/api/life-logging", lifeLoggingRoutes);
app.use("/api/admin/patients", adminPatientRoutes);
app.use("/api/admin/behavior", behaviorRoutes);
app.use("/api/admin/personal-objects", personalObjectRoutes);
app.use("/api/patients", cognitivePatientRoutes);
app.use("/api", protectedRoutes);

// Family Memory Story routes
app.use("/api/family/memories", memoryRoutes);
app.use("/api/family/profile", familyProfileRoutes);
app.use("/api/family/emotion", emotionRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "MemoCare API is running ✅" });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

io.on("connection", (socket) => {
  console.log("MemoCare Client Connected:", socket.id);
  socket.on("disconnect", () => console.log("Client Disconnected"));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Listening on PORT ${PORT} : http://localhost:${PORT}`);
});
