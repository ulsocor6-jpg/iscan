import express from "express";
import controller from "./clientHealthController.js";

const router = express.Router();

router.post(
    "/heartbeat",
    controller.heartbeat
);

export default router;
