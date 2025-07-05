const Activity = require("../models/Activity");

const getActivities = async (req, res) => {
  try {
    const { limit = 20, taskId } = req.query;

    const query = taskId ? { taskId } : {};
    const activities = await Activity.find(query)
      .populate("userId", "name email")
      .populate("taskId", "title")
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ message: "Error fetching activities" });
  }
};

const createActivity = async (req, res) => {
  try {
    const { type, taskId, details } = req.body;

    const activity = new Activity({
      type,
      taskId,
      userId: req.user.id,
      details,
      timestamp: new Date(),
    });

    const savedActivity = await activity.save();
    const populatedActivity = await Activity.findById(savedActivity._id)
      .populate("userId", "name email")
      .populate("taskId", "title");

    res.status(201).json(populatedActivity);
  } catch (error) {
    console.error("Error creating activity:", error);
    res.status(500).json({ message: "Error creating activity" });
  }
};

module.exports = {
  getActivities,
  createActivity,
};
