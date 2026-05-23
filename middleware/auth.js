const jwt = require("jsonwebtoken");
require("dotenv").config();

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token manquant ou invalide" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "artisana_secret");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token expiré ou invalide" });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || "artisana_secret");
    } catch {}
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
