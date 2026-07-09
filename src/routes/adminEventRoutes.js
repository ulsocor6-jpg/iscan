import express from "express";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { listEvents } from "../controllers/adminEventController.js";

const router = express.Router();

router.get("/", requireAuth, requireAdmin, listEvents);

export default router;
