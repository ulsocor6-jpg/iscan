import express from "express";
import activityController from "../intelligence/activity/activityController.js";

const router = express.Router();

router.get("/summary", (req, res) => {

    res.json(
        activityController.summary()
    );

});

router.get("/sessions", (req, res) => {

    res.json(
        activityController.sessions()
    );

});

router.get("/sessions/:id", (req, res) => {

    const session =
        activityController.session(req.params.id);

    if (!session) {

        return res
            .status(404)
            .json({
                error: "SESSION_NOT_FOUND"
            });

    }

    res.json(session);

});

export default router;
