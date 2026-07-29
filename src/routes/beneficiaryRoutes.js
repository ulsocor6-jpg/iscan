import express from "express";

import {
addBeneficiary,
getBeneficiaries
}
from "../controllers/beneficiaryController.js";

import { requireAuth } from '../auth/middleware/authMiddleware.js';

const router = express.Router();

router.post(
"/",
requireAuth,
addBeneficiary
);

router.get(
"/",
requireAuth,
getBeneficiaries
);

export default router;
