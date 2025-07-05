const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  smartAssign,
  resolveConflict,
} = require("../controllers/taskController");

router.use(verifyToken); // Protect all routes

// Main task routes
router.get("/", getTasks);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

// Smart assignment route
router.post("/:id/smart-assign", smartAssign);

// Conflict resolution
router.post("/resolve-conflict", resolveConflict);

module.exports = router;
