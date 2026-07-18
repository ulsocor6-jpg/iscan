import express from "express";

import {
    runtime,
    workers,
    restart,
    incidents,
    openIncidents,
    incident,
    acknowledgeIncident,
    resolveIncident
}
from "../../controllers/operatorController.js";
import { requireAuth, requireAdmin } from "../../middleware/authMiddleware.js";


const router = express.Router();

// Every route below is operator-console-only — admin auth required.
router.use(requireAuth, requireAdmin);



router.get(
    "/runtime",
    runtime
);



router.get(
    "/workers",
    workers
);



router.post(
    "/restart",
    restart
);



router.get(
    "/incidents",
    incidents
);



router.get(
    "/incidents/open",
    openIncidents
);



router.get(
    "/incidents/:id",
    incident
);



router.post(
    "/incidents/:id/acknowledge",
    acknowledgeIncident
);



router.post(
    "/incidents/:id/resolve",
    resolveIncident
);



export default router;
