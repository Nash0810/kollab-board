const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

router.use(verifyToken); // protects all task routes

router.get("/", getTasks); // Fetch all
router.post("/", createTask); // Create
router.put("/:id", updateTask); // Update
router.delete("/:id", deleteTask); // Delete

module.exports = router;
