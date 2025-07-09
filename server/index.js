const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const taskRoutesFn = require("./routes/taskRoutes");
const userRoutes = require("./routes/userRoutes");
const commentRoutesFn = require("./routes/commentRoutes");
const activityRoutesFn = require("./routes/activityRoutes");

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_URL || "http://localhost:5173";

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

// Middleware
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutesFn(io));
app.use("/api/comments", commentRoutesFn(io));
app.use("/api/activities", activityRoutesFn(io));

const activeEditors = {}; // taskId -> userId

// 🔌 Socket.IO connection
io.on("connection", (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  socket.on("join-user", (userId) => {
    socket.join(`user-${userId}`);
    socket.userId = userId;
    console.log(`User ${userId} joined with socket ${socket.id}`);
  });

  socket.on("join-task-room", (taskId) => {
    socket.join(taskId);
  });

  socket.on("leave-task-room", (taskId) => {
    socket.leave(taskId);
  });

  socket.on("start-editing", (taskId) => {
    if (!socket.userId) {
      console.warn(
        "Received start-editing before userId set on socket:",
        socket.id
      );
      return;
    }

    console.log(`start-editing from ${socket.userId} on task ${taskId}`);

    if (activeEditors[taskId] && activeEditors[taskId] !== socket.userId) {
      console.log(
        `Conflict! Task ${taskId} already being edited by ${activeEditors[taskId]}`
      );
      socket.emit("edit-conflict", {
        taskId,
        currentEditor: activeEditors[taskId],
      });
    } else {
      activeEditors[taskId] = socket.userId;
      console.log(`Task ${taskId} locked by ${socket.userId}`);
      socket.broadcast.emit("task-locked", {
        taskId,
        editorId: socket.userId,
      });
    }
  });

  socket.on("stop-editing", (taskId) => {
    if (socket.userId && activeEditors[taskId] === socket.userId) {
      delete activeEditors[taskId];
      console.log(`stop-editing from ${socket.userId} on task ${taskId}`);
      socket.broadcast.emit("task-unlocked", { taskId });
    }
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Disconnected: ${socket.id} (userId: ${socket.userId})`);
    for (const [taskId, editorId] of Object.entries(activeEditors)) {
      if (editorId === socket.userId) {
        delete activeEditors[taskId];
        io.emit("task-unlocked", { taskId });
      }
    }
  });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
