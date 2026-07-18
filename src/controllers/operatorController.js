// src/controllers/operatorController.js

import operatorService from "../operator/operatorService.js";
import incidentEngine from "../services/operator/incidentEngine.js";

/*
|--------------------------------------------------------------------------
| Runtime
|--------------------------------------------------------------------------
*/

export async function runtime(req, res) {

    try {

        res.json({
            success: true,
            data: operatorService.getRuntime()
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

}

/*
|--------------------------------------------------------------------------
| Workers
|--------------------------------------------------------------------------
*/

export async function workers(req, res) {

    try {

        res.json({
            success: true,
            data: operatorService.getWorkers()
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

}

/*
|--------------------------------------------------------------------------
| Restart
|--------------------------------------------------------------------------
*/

export async function restart(req, res) {

    try {

        const result = await operatorService.restart();

        res.json({
            success: true,
            data: result
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

}

/*
|--------------------------------------------------------------------------
| Incidents
|--------------------------------------------------------------------------
*/

export async function incidents(req, res) {

    try {

        res.json({

            success: true,

            data: incidentEngine.list()

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

export async function openIncidents(req, res) {

    try {

        res.json({

            success: true,

            data: incidentEngine.listOpen()

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

export async function incident(req, res) {

    try {

        const result =
            incidentEngine.get(req.params.id);

        if (!result) {

            return res.status(404).json({

                success: false,

                message: "Incident not found"

            });

        }

        res.json({

            success: true,

            data: result

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

/*
|--------------------------------------------------------------------------
| Incident Actions
|--------------------------------------------------------------------------
*/

export async function acknowledgeIncident(req, res) {

    try {

        const result =
            incidentEngine.acknowledge(
                req.params.id
            );

        if (!result) {

            return res.status(404).json({

                success: false,

                message: "Incident not found"

            });

        }

        res.json({

            success: true,

            data: result

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

export async function resolveIncident(req, res) {

    try {

        const result =
            incidentEngine.resolveById(
                req.params.id
            );

        if (!result) {

            return res.status(404).json({

                success: false,

                message: "Incident not found"

            });

        }

        res.json({

            success: true,

            data: result

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}
