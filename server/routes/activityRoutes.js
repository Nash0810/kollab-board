const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const {
  getActivities,
  createActivity,
} = require("../controllers/activityController");

// Export a function that accepts the 'io' instance
module.exports = (io) => {
  const router = express.Router(); // Create a new router instance inside the function

  router.use(verifyToken); // Apply authentication middleware

  // Main activity routes
  router.get("/", getActivities);
  router.post("/", (req, res) => createActivity(req, res, io));

  return router;
};
