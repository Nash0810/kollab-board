const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  const tokenString = token.startsWith("Bearer ")
    ? token.slice(7, token.length)
    : token;

  try {
    const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = verifyToken;
