const Task = require("../models/Task");

const getTasks = async (req, res) => {
  const tasks = await Task.find(); // optionally filter by user
  res.json(tasks);
};

const createTask = async (req, res) => {
  const { title, description, priority, status, assignedTo } = req.body;

  const task = new Task({
    title,
    description,
    priority,
    status: status || "Todo",
    assignedTo: assignedTo || req.user.id, // fallback to current user
    createdBy: req.user.id,
  });

  const saved = await task.save();
  res.status(201).json(saved);
};

const updateTask = async (req, res) => {
  const { title, description, priority, status, assignedTo } = req.body;

  const updated = await Task.findByIdAndUpdate(
    req.params.id,
    {
      title,
      description,
      priority,
      status,
      assignedTo,
    },
    { new: true }
  );

  res.json(updated);
};

const deleteTask = async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ msg: "Task deleted" });
};

module.exports = { getTasks, createTask, updateTask, deleteTask };
