const Task = require("../models/Task");
const User = require("../models/User");
const Activity = require("../models/Activity");
const { validationResult } = require("express-validator");

// Helper function to log activity
const logActivity = async (type, taskId, userId, details = {}) => {
  try {
    const activity = new Activity({
      type,
      taskId,
      userId,
      details,
      timestamp: new Date(),
    });
    await activity.save();
    return activity;
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

const getTasks = async (req, res) => {
  try {
    const { status, assignedTo, priority, search } = req.query;
    let query = {};

    // Apply filters
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Error fetching tasks" });
  }
};

const createTask = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, priority, assignedTo } = req.body;

    // Check for unique title
    const existingTask = await Task.findOne({ title });
    if (existingTask) {
      return res.status(400).json({ message: "Task title must be unique" });
    }

    // Check if title matches column names
    const columnNames = ["Todo", "In Progress", "Done"];
    if (columnNames.includes(title)) {
      return res.status(400).json({
        message: "Task title cannot match column names",
      });
    }

    const task = new Task({
      title,
      description,
      priority,
      status: "Todo",
      assignedTo,
      createdBy: req.user.id,
    });

    const savedTask = await task.save();
    const populatedTask = await Task.findById(savedTask._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    // Log activity
    await logActivity("create", savedTask._id, req.user.id, {
      title: savedTask.title,
      assignedTo: assignedTo,
    });

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Error creating task" });
  }
};

const updateTask = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, priority, status, assignedTo } = req.body;
    const taskId = req.params.id;

    // Check if task exists
    const existingTask = await Task.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check for unique title (excluding current task)
    if (title && title !== existingTask.title) {
      const titleExists = await Task.findOne({ title, _id: { $ne: taskId } });
      if (titleExists) {
        return res.status(400).json({ message: "Task title must be unique" });
      }
    }

    // Check if title matches column names
    const columnNames = ["Todo", "In Progress", "Done"];
    if (title && columnNames.includes(title)) {
      return res.status(400).json({
        message: "Task title cannot match column names",
      });
    }

    // Track changes for activity log
    const changes = {};
    if (title !== existingTask.title)
      changes.title = { from: existingTask.title, to: title };
    if (status !== existingTask.status)
      changes.status = { from: existingTask.status, to: status };
    if (assignedTo !== existingTask.assignedTo?.toString())
      changes.assignedTo = { from: existingTask.assignedTo, to: assignedTo };

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        title,
        description,
        priority,
        status,
        assignedTo,
        lastModified: Date.now(),
      },
      { new: true }
    )
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    // Log activity if there are changes
    if (Object.keys(changes).length > 0) {
      await logActivity("update", taskId, req.user.id, changes);
    }

    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Error updating task" });
  }
};

const deleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    await Task.findByIdAndDelete(taskId);

    // Log activity
    await logActivity("delete", taskId, req.user.id, {
      title: task.title,
    });

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Error deleting task" });
  }
};

// Smart Assign Implementation
const smartAssign = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Get all users
    const users = await User.find({}, "_id name email");

    // Count active tasks for each user (Todo + In Progress)
    const userTaskCounts = await Promise.all(
      users.map(async (user) => {
        const activeTaskCount = await Task.countDocuments({
          assignedTo: user._id,
          status: { $in: ["Todo", "In Progress"] },
        });
        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          activeTaskCount,
        };
      })
    );

    // Find user with minimum active tasks
    const smartAssignUser = userTaskCounts.reduce((min, user) =>
      user.activeTaskCount < min.activeTaskCount ? user : min
    );

    // Update task
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { assignedTo: smartAssignUser.userId, lastModified: Date.now() },
      { new: true }
    )
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    // Log activity
    await logActivity("smart_assign", taskId, req.user.id, {
      title: task.title,
      assignedTo: smartAssignUser.userId,
      reason: `Auto-assigned to user with least active tasks (${smartAssignUser.activeTaskCount})`,
    });

    res.json({
      task: updatedTask,
      smartAssignReason: `Assigned to ${smartAssignUser.name} who has the least active tasks (${smartAssignUser.activeTaskCount})`,
    });
  } catch (error) {
    console.error("Error in smart assign:", error);
    res.status(500).json({ message: "Error in smart assign" });
  }
};

// Handle conflict resolution
const resolveConflict = async (req, res) => {
  try {
    const { taskId, resolution, mergedData } = req.body;

    if (resolution === "merge") {
      // Apply merged data
      const updatedTask = await Task.findByIdAndUpdate(
        taskId,
        { ...mergedData, lastModified: Date.now() },
        { new: true }
      )
        .populate("assignedTo", "name email")
        .populate("createdBy", "name email");

      // Log activity
      await logActivity("conflict_resolve", taskId, req.user.id, {
        resolution: "merge",
        title: updatedTask.title,
      });

      res.json(updatedTask);
    } else if (resolution === "overwrite") {
      // Overwrite with current user's data
      const updatedTask = await Task.findByIdAndUpdate(
        taskId,
        { ...mergedData, lastModified: Date.now() },
        { new: true }
      )
        .populate("assignedTo", "name email")
        .populate("createdBy", "name email");

      // Log activity
      await logActivity("conflict_resolve", taskId, req.user.id, {
        resolution: "overwrite",
        title: updatedTask.title,
      });

      res.json(updatedTask);
    } else {
      res.status(400).json({ message: "Invalid resolution type" });
    }
  } catch (error) {
    console.error("Error resolving conflict:", error);
    res.status(500).json({ message: "Error resolving conflict" });
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  smartAssign,
  resolveConflict,
};
