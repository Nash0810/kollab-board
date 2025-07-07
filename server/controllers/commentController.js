const Comment = require("../models/Comment");
const Task = require("../models/Task"); // To ensure task exists
const Activity = require("../models/Activity"); // For logging activity

// Helper to log activities (can be reused from taskController or defined here)
const logActivity = async (type, taskId, userId, details = {}, io) => {
  try {
    const activity = new Activity({
      type,
      taskId,
      userId,
      details,
      timestamp: new Date(),
    });

    const savedActivity = await activity.save();
    const populatedActivity = await Activity.findById(savedActivity._id)
      .populate("userId", "name email")
      .populate("taskId", "title");

    if (io) {
      io.emit("activity-added", populatedActivity);
    }
    return populatedActivity;
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

// Get all comments for a specific task
const getCommentsByTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const comments = await Comment.find({ taskId })
      .populate("userId", "name email") // Populate user details for each comment
      .sort({ createdAt: 1 }); // Sort by oldest first

    res.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ message: "Error fetching comments" });
  }
};

// Add a new comment to a task
const addComment = async (req, res, io) => {
  try {
    const { taskId, content } = req.body;
    const userId = req.user.id; // From auth middleware

    // Basic validation
    if (!taskId || !content) {
      return res
        .status(400)
        .json({ message: "Task ID and content are required." });
    }

    // Ensure task exists
    const taskExists = await Task.findById(taskId);
    if (!taskExists) {
      return res.status(404).json({ message: "Task not found." });
    }

    const newComment = new Comment({
      taskId,
      userId,
      content,
    });

    const savedComment = await newComment.save();
    const populatedComment = await Comment.findById(savedComment._id)
      .populate("userId", "name email")
      .populate("taskId", "title");

    // Emit real-time update for new comment
    if (io) {
      io.to(taskId).emit("comment-added", populatedComment); // Emit to room for that task
    }

    // Log activity for comment addition
    await logActivity(
      "Comment Added",
      taskId,
      userId,
      {
        commentId: savedComment._id,
        content: savedComment.content,
        userName: req.user.name || req.user.email,
        taskTitle: taskExists.title,
      },
      io
    );

    res.status(201).json(populatedComment);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Error adding comment" });
  }
};

module.exports = {
  getCommentsByTask,
  addComment,
};
