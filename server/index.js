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

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

// Inject io into route handlers
const taskRoutes = taskRoutesFn(io);
const commentRoutes = commentRoutesFn(io);
const activityRoutes = activityRoutesFn(io);

// Active editors tracker
const activeEditors = {};

// Socket.IO handlers
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-user", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their personal room.`);
  });

  socket.on("join-task-room", (taskId) => {
    socket.join(taskId);
    console.log(`User ${socket.id} joined task room: ${taskId}`);
  });

  socket.on("leave-task-room", (taskId) => {
    socket.leave(taskId);
    console.log(`User ${socket.id} left task room: ${taskId}`);
  });

  socket.on("start-editing", (taskId) => {
    const userId = socket.handshake.auth.token?.id || null;
    if (activeEditors[taskId] && activeEditors[taskId] !== userId) {
      socket.emit("edit-conflict", {
        taskId,
        currentEditor: activeEditors[taskId],
      });
    } else {
      activeEditors[taskId] = userId;
      console.log(`User ${userId} started editing task ${taskId}`);
      socket.broadcast.emit("task-locked", { taskId, editorId: userId });
    }
  });

  socket.on("stop-editing", (taskId) => {
    const userId = socket.handshake.auth.token?.id || null;
    if (activeEditors[taskId] === userId) {
      delete activeEditors[taskId];
      console.log(`User ${userId} stopped editing task ${taskId}`);
      socket.broadcast.emit("task-unlocked", { taskId });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const userId = socket.handshake.auth.token?.id || null;
    for (const taskId in activeEditors) {
      if (activeEditors[taskId] === userId) {
        delete activeEditors[taskId];
        io.emit("task-unlocked", { taskId });
      }
    }
  });
});

// Middleware
app.set("socketio", io);
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/activities", activityRoutes);

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
