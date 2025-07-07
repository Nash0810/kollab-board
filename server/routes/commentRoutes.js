const express = require("express");
const auth = require("../middleware/authMiddleware");
const commentController = require("../controllers/commentController");

module.exports = (io) => {
  const router = express.Router();

  router.use(auth); // apply authentication middleware

  router.get("/:taskId", commentController.getCommentsByTask);

  router.post("/", (req, res) => {
    commentController.addComment(req, res, io);
  });

  return router;
};
