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

module.exports = (io) => {
  const router = express.Router();

  router.use(verifyToken);

  router.get("/", (req, res) => {
    console.log("Backend: taskRoutes - GET / route hit!");
    getTasks(req, res);
  });

  router.post("/", (req, res) => createTask(req, res, io));
  router.put("/:id", (req, res) => updateTask(req, res, io));
  router.delete("/:id", (req, res) => deleteTask(req, res, io));

  router.post("/:id/smart-assign", (req, res) => smartAssign(req, res, io));
  router.post("/resolve-conflict", (req, res) => resolveConflict(req, res, io));

  return router;
};
