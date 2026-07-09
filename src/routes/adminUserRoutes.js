import express from "express";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { listUsers, promoteUser, demoteUser, getUserDetails, impersonateUser } from "../controllers/adminUserController.js";

const router = express.Router();

router.get("/", requireAuth, requireAdmin, listUsers);
router.get("/:id/details", requireAuth, requireAdmin, getUserDetails);
router.post("/:id/promote", requireAuth, requireAdmin, promoteUser);
router.post("/:id/demote", requireAuth, requireAdmin, demoteUser);
router.post("/:id/impersonate", requireAuth, requireAdmin, impersonateUser);

export default router;
