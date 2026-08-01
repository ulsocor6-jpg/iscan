import express from "express";
import controller from "./nodeRegistrationController.js";

const router = express.Router();

router.post(
    "/register",
    controller.register
);

export default router;
