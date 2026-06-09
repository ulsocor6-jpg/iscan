import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
  try {
    // 1. Try cookie first
    let token = req.cookies?.iscan_token;

    // 2. Fallback to Bearer token
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;

      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    // 3. No token found
    if (!token) {
      return res.status(401).json({ error: "Not logged in." });
    }

    // 4. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();

  } catch (err) {
    return res.status(401).json({
      error: "Session expired.",
      reason: err.message
    });
  }
};
