import crypto from "crypto";

const store = new Map(); // replace with Redis in production

export const idempotency = async (req, res, next) => {
  const key = req.headers["idempotency-key"];

  if (!key) {
    return res.status(400).json({ error: "Missing idempotency key" });
  }

  if (store.has(key)) {
    return res.status(409).json({
      error: "Duplicate request detected"
    });
  }

  store.set(key, true);
  next();
};
