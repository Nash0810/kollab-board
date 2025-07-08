const Task = require("../models/Task");
const User = require("../models/User");
const Activity = require("../models/Activity");
const { validationResult } = require("express-validator");

// Emit activity to socket and save in DB
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
    console.error("Error logging activity:", error.message, error.stack);
  }
};

const getTasks = async (req, res) => {
  console.log("Backend: getTasks function entered.");
  try {
    const { status, assignedTo, priority, search } = req.query;
    let query = {};

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
    console.error("getTasks error:", error.message, error.stack);
    res.status(500).json({ message: "Error fetching tasks" });
  }
};

const createTask = async (req, res, io) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    console.log("Received task data:", req.body);

    const { title, description, priority, assignedTo, dueDate } = req.body;

    const existingTask = await Task.findOne({ title });
    if (existingTask) {
      return res.status(400).json({ message: "Task title must be unique" });
    }

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
      assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
      createdBy: req.user.id,
      dueDate: dueDate || null,
    });

    const savedTask = await task.save();
    const populatedTask = await Task.findById(savedTask._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    await logActivity(
      "Task Created",
      savedTask._id,
      req.user.id,
      {
        title: savedTask.title,
        userName: req.user.name || req.user.email,
      },
      io
    );

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error("Error creating task:", error.message, error.stack);
    res.status(500).json({ message: "Error creating task" });
  }
};

const updateTask = async (req, res, io) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.id;
    const updates = req.body;

    const existingTask = await Task.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (updates.title && updates.title !== existingTask.title) {
      const titleExists = await Task.findOne({
        title: updates.title,
        _id: { $ne: taskId },
      });
      if (titleExists) {
        return res.status(400).json({ message: "Task title must be unique" });
      }
    }

    const columnNames = ["Todo", "In Progress", "Done"];
    if (updates.title && columnNames.includes(updates.title)) {
      return res.status(400).json({
        message: "Task title cannot match column names",
      });
    }

    const changes = {};
    if (updates.title && updates.title !== existingTask.title)
      changes.title = { from: existingTask.title, to: updates.title };

    if (updates.status && updates.status !== existingTask.status) {
      changes.status = { from: existingTask.status, to: updates.status };
    }

    if (updates.assignedTo) {
      const existingAssignedToIds = existingTask.assignedTo
        .map((u) => u.toString())
        .sort();
      const newAssignedToIds = updates.assignedTo
        .map((u) => u.toString())
        .sort();

      if (
        JSON.stringify(existingAssignedToIds) !==
        JSON.stringify(newAssignedToIds)
      ) {
        const fromNames = await Promise.all(
          existingAssignedToIds.map(async (id) => {
            const user = await User.findById(id);
            return user ? user.name || user.email : "Unknown User";
          })
        );
        const toNames = await Promise.all(
          newAssignedToIds.map(async (id) => {
            const user = await User.findById(id);
            return user ? user.name || user.email : "Unknown User";
          })
        );
        changes.assignedTo = { from: fromNames, to: toNames };
      }
    }

    const newDueDate = updates.dueDate
      ? new Date(updates.dueDate).toISOString().split("T")[0]
      : null;
    const existingDueDate = existingTask.dueDate
      ? existingTask.dueDate.toISOString().split("T")[0]
      : null;
    if (newDueDate !== existingDueDate) {
      changes.dueDate = { from: existingDueDate, to: newDueDate };
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { ...updates, lastModified: Date.now() },
      { new: true, runValidators: true }
    )
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    if (!updatedTask) {
      return res
        .status(404)
        .json({ message: "Task not found after update attempt" });
    }

    if (Object.keys(changes).length > 0) {
      let activityType = "Task Updated";
      if (changes.status) activityType = "Task Status Changed";
      else if (changes.assignedTo) activityType = "Task Assigned";
      else if (changes.title) activityType = "Task Title Changed";
      else if (changes.dueDate) activityType = "Task Due Date Changed";

      await logActivity(
        activityType,
        taskId,
        req.user.id,
        { ...changes, userName: req.user.name || req.user.email },
        io
      );
    }

    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error.message, error.stack);
    res.status(500).json({ message: "Error updating task" });
  }
};

const deleteTask = async (req, res, io) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    await Task.findByIdAndDelete(taskId);

    await logActivity(
      "Task Deleted",
      taskId,
      req.user.id,
      {
        title: task.title,
        userName: req.user.name || req.user.email,
      },
      io
    );

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error.message, error.stack);
    res.status(500).json({ message: "Error deleting task" });
  }
};

const smartAssign = async (req, res, io) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const users = await User.find({}, "_id name email");
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

    const smartAssignUser = userTaskCounts.reduce((min, user) =>
      user.activeTaskCount < min.activeTaskCount ? user : min
    );

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { assignedTo: [smartAssignUser.userId], lastModified: Date.now() },
      { new: true }
    )
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    await logActivity(
      "Task Assigned (Smart)",
      taskId,
      req.user.id,
      {
        title: task.title,
        assignedTo: smartAssignUser.userId,
        reason: `Auto-assigned to ${
          smartAssignUser.name || smartAssignUser.email
        }`,
        userName: req.user.name || req.user.email,
      },
      io
    );

    res.json({
      task: updatedTask,
      smartAssignReason: `Assigned to ${
        smartAssignUser.name || smartAssignUser.email
      } who has the least active tasks (${smartAssignUser.activeTaskCount})`,
    });
  } catch (error) {
    console.error("Error in smart assign:", error.message, error.stack);
    res.status(500).json({ message: "Error in smart assign" });
  }
};

const resolveConflict = async (req, res, io) => {
  try {
    const { taskId, resolution, mergedData } = req.body;

    if (["merge", "overwrite"].includes(resolution)) {
      const updatedTask = await Task.findByIdAndUpdate(
        taskId,
        { ...mergedData, lastModified: Date.now() },
        { new: true }
      )
        .populate("assignedTo", "name email")
        .populate("createdBy", "name email");

      await logActivity(
        "Conflict Resolved",
        taskId,
        req.user.id,
        {
          resolution,
          title: updatedTask.title,
          userName: req.user.name || req.user.email,
        },
        io
      );

      return res.json(updatedTask);
    }

    res.status(400).json({ message: "Invalid resolution type" });
  } catch (error) {
    console.error("Error resolving conflict:", error.message, error.stack);
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
