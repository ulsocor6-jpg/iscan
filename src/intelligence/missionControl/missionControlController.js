import missionControlSnapshotService from "./missionControlSnapshotService.js";

class MissionControlController {

    async snapshot(req, res) {

        try {

            return res.json(
                missionControlSnapshotService.getSnapshot()
            );

        } catch (error) {

            console.error(
                "Mission Control Snapshot Error:",
                error
            );

            return res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }

}

export default new MissionControlController();
