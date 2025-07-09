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

const activeEditors = {
  [taskId]: { userId: "...", timestamp: Date },
}; // taskId -> userId

const jwt = require("jsonwebtoken");

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    console.warn("Socket auth token missing");
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id; // Attach user ID to the socket
    console.log(`Socket auth passed. User ID: ${socket.userId}`);
    next();
  } catch (err) {
    console.error("Socket auth failed:", err.message);
    next(new Error("Authentication failed"));
  }
});

// 🔌 Socket.IO connection
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  //  socket.on("join-user", (userId) => {
  //    socket.join(`user-${userId}`);
  //    socket.userId = userId;
  //    console.log(`User ${userId} joined with socket ${socket.id}`);
  //  });

  socket.on("join-task-room", (taskId) => {
    socket.join(taskId);
  });

  socket.on("leave-task-room", (taskId) => {
    socket.leave(taskId);
  });

  socket.on("start-editing", (taskId) => {
    const editor = activeEditors[taskId];

    if (editor && editor.userId !== socket.userId) {
      console.log(
        `Conflict detected: Task ${taskId} already locked by ${editor.userId}`
      );
      socket.emit("edit-conflict", {
        taskId,
        currentEditor: editor.userId,
      });
    } else {
      activeEditors[taskId] = {
        userId: socket.userId,
        timestamp: Date.now(),
      };
      console.log(`Task ${taskId} locked by ${socket.userId}`);
      socket.broadcast.emit("task-locked", {
        taskId,
        editorId: socket.userId,
      });
    }
  });

  socket.on("stop-editing", (taskId) => {
    const editor = activeEditors[taskId];
    if (editor && editor.userId === socket.userId) {
      delete activeEditors[taskId];
      console.log(`Task ${taskId} unlocked by ${socket.userId}`);
      socket.broadcast.emit("task-unlocked", { taskId });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id} (userId: ${socket.userId})`);

    // Delay cleanup to prevent flickers from quick reconnects
    setTimeout(() => {
      for (const [taskId, editorId] of Object.entries(activeEditors)) {
        if (editorId === socket.userId) {
          delete activeEditors[taskId];
          io.emit("task-unlocked", { taskId });
          console.log(
            `Removed editor lock for task ${taskId} from ${editorId}`
          );
        }
      }
    }, 5000); // wait 5 seconds to see if they reconnect
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
