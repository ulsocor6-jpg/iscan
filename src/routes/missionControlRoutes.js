import express from "express";
import missionControlController from "../intelligence/missionControl/missionControlController.js";

const router = express.Router();

router.get(
    "/",
    missionControlController.snapshot
);

export default router;
