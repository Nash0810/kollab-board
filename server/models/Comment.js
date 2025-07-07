const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
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
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Index for efficient querying comments by task
CommentSchema.index({ taskId: 1 });

const Comment =
  mongoose.models.Comment || mongoose.model("Comment", CommentSchema);

module.exports = Comment;
