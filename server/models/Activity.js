const mongoose = require("mongoose");

const ActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "Task Created",
        "Task Updated",
        "Task Deleted",
        "Task Assigned",
        "Task Status Changed",
        "Comment Added",
        "Task Assigned (Smart)",
        "Task Due Date Changed",
      ],
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    details: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const Activity =
  mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);

module.exports = Activity;
