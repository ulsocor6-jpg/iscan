import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {

    res.json({

        success: true,

        authenticated: true,

        user: req.user

    });

});

export default router;
