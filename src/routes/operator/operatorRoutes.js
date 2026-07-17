import express from "express";

import {
    runtime,
    workers,
    restart
}
from "../../controllers/operatorController.js";


const router = express.Router();



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



export default router;
