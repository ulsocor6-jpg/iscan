import express from "express";

import {
  getFlows,
  getFlow,
  clearFlows
} from "../../controllers/admin/inspectorController.js";

import {
  requireAuth,
  requireAdmin
} from "../../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get("/", getFlows);

router.get("/:flowId", getFlow);

router.delete("/clear", clearFlows);

export default router;
