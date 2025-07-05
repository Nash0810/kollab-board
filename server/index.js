process.env.DEBUG_URL = "";

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const morgan = require("morgan");

dotenv.config();

// Import routes
const authRoutes = require("./routes/authRoutes");
// Modified to import route functions that accept 'io'
const taskRoutes = require("./routes/taskRoutes");
const userRoutes = require("./routes/userRoutes");
const activityRoutes = require("./routes/activityRoutes");

// Import your authentication middleware
const authMiddleware = require("./middleware/authMiddleware");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

["/api/auth", "/api/tasks", "/api/users", "/api/activities"].forEach((path) => {
  if (!path || path.includes(":/") || /\/{2,}/.test(path)) {
    console.error("Invalid route path detected:", path);
  }
});

// Security middleware
app.use(helmet());
app.use(morgan("combined"));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api", limiter); // Apply to all /api routes

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes

app.use("/api/auth", authRoutes);

app.use("/api/tasks", authMiddleware, taskRoutes(io));
app.use("/api/users", authMiddleware, userRoutes);
app.use("/api/activities", authMiddleware, activityRoutes(io));

app.get("/", (req, res) => {
  res.json({ message: "Collaborative Todo Board API", version: "1.0.0" });
});

// Store active task editors
const activeEditors = new Map();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Join user to their room
  socket.on("join-user", (userId) => {
    socket.join(`user-${userId}`);
    socket.userId = userId;
  });

  // Handle task editing start
  socket.on("start-editing", (taskId) => {
    const currentEditor = activeEditors.get(taskId);
    if (currentEditor && currentEditor.socketId !== socket.id) {
      // Conflict detected
      socket.emit("edit-conflict", {
        taskId,
        currentEditor: currentEditor.userId,
      });
      return;
    }

    activeEditors.set(taskId, {
      socketId: socket.id,
      userId: socket.userId,
      timestamp: Date.now(),
    });

    socket.broadcast.emit("task-being-edited", {
      taskId,
      userId: socket.userId,
    });
  });

  // Handle task editing end
  socket.on("stop-editing", (taskId) => {
    const currentEditor = activeEditors.get(taskId);
    if (currentEditor && currentEditor.socketId === socket.id) {
      activeEditors.delete(taskId);
      socket.broadcast.emit("task-editing-stopped", taskId);
    }
  });

  // Handle task updates (from client to other clients)
  socket.on("task-updated", (data) => {
    // Broadcast to all other clients in the room
    socket.broadcast.emit("task-updated", data);
  });
  socket.on("activity-added", (activity) => {
    socket.broadcast.emit("activity-added", activity);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    // Clean up active editors
    for (const [taskId, editor] of activeEditors.entries()) {
      if (editor.socketId === socket.id) {
        activeEditors.delete(taskId);
        socket.broadcast.emit("task-editing-stopped", taskId);
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

// Handle 404
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true, // Deprecated, but keeping for compatibility
    useUnifiedTopology: true, // Deprecated, but keeping for compatibility
  })
  .then(() => {
    console.log("MongoDB connected successfully");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed.");
      process.exit(0);
    });
  });
});

module.exports = { app, io };
