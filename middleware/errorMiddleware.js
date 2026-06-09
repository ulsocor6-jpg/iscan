import { verifyToken } from "../security/jwt.js";

export const requireAuth = (req, res, next) => {
  // 1. SESSION CHECK (browser dashboard)
  if (req.session?.userId) {
    req.user = { id: req.session.userId };
    return next();
  }

  // 2. JWT CHECK (API)
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
};
