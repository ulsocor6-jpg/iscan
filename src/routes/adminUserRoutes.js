import express from "express";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { listUsers, promoteUser, demoteUser } from "../controllers/adminUserController.js";

const router = express.Router();

router.get("/", requireAuth, requireAdmin, listUsers);
router.post("/:id/promote", requireAuth, requireAdmin, promoteUser);
router.post("/:id/demote", requireAuth, requireAdmin, demoteUser);

export default router;
