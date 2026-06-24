import express from "express";
import {
  listPending,
  approveDeposit
} from "../controllers/adminDepositController.js";

const router = express.Router();

router.get("/pending", listPending);
router.post("/:id/approve", approveDeposit);

export default router;
