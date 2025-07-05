const express = require("express");
const verifyToken = require("../middleware/authMiddleware");
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  smartAssign,
  resolveConflict,
} = require("../controllers/taskController");

// Export a function that accepts the 'io' instance
module.exports = (io) => {
  const router = express.Router();

  router.use(verifyToken); // Protect all routes in this router

  router.get("/", getTasks);
  router.post("/", (req, res) => createTask(req, res, io));
  router.put("/:id", (req, res) => updateTask(req, res, io));
  router.delete("/:id", (req, res) => deleteTask(req, res, io));

  // Smart assignment route - pass 'io'
  router.post("/:id/smart-assign", (req, res) => smartAssign(req, res, io));

  // Conflict resolution - pass 'io'
  router.post("/resolve-conflict", (req, res) => resolveConflict(req, res, io));

  return router;
};
