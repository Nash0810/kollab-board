const Task = require("../models/Task");

const getTasks = async (req, res) => {
  const tasks = await Task.find().populate("assignedTo", "name email");
  res.json(tasks);
};

const createTask = async (req, res) => {
  const { title, description, priority } = req.body;
  const task = await Task.create({
    title,
    description,
    priority,
    assignedTo: req.user.id,
  });
  res.status(201).json(task);
};

const updateTask = async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.json(task);
};

const deleteTask = async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ msg: "Task deleted" });
};

module.exports = { getTasks, createTask, updateTask, deleteTask };
