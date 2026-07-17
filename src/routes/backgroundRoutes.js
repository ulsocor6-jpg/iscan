import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/authMiddleware.js";
import User from "../models/userModel.js";

const router = express.Router();

const uploadDir = path.join(process.cwd(), "public", "uploads", "backgrounds");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, or WEBP images are allowed."));
    }
    cb(null, true);
  },
});

// Preset backgrounds live in public/assets — add more keys here as you add images
const PRESETS = {
  frieren: "/assets/frieren-bg.jpg",
};

// GET /api/v1/user/background
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("backgroundPreference").lean();
    res.json({ success: true, background: user?.backgroundPreference || { type: "none", value: "" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/user/background/preset  { key: "frieren" }
router.post("/preset", requireAuth, async (req, res) => {
  try {
    const { key } = req.body;
    const value = PRESETS[key];
    if (!value) return res.status(400).json({ error: "Unknown preset." });

    await User.findByIdAndUpdate(req.user.id, {
      backgroundPreference: { type: "preset", value },
    });

    res.json({ success: true, background: { type: "preset", value } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/user/background — reset to none
router.delete("/", requireAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      backgroundPreference: { type: "none", value: "" },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
