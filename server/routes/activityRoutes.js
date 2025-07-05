const express = require("express");
const router = express.Router();
const {
  getActivities,
  createActivity,
} = require("../controllers/activityController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, getActivities);
router.post("/", authMiddleware, createActivity);

module.exports = router;
