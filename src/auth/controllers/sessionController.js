import SessionRegistryService from "../services/sessionRegistryService.js";

export const getSessions = async (req, res) => {

    try {

        const sessions = await SessionRegistryService.getUserSessions(
            req.user.id
        );

        return res.json({
            success: true,
            sessions
        });

    } catch (err) {

        console.error("[SESSION LIST]", err);

        return res.status(500).json({
            success: false,
            message: "Unable to load sessions."
        });

    }

};

export const getCurrentSession = async (req, res) => {

    try {

        const session = await SessionRegistryService.getSession(
            req.user.sessionId
        );

        return res.json({
            success: true,
            session
        });

    } catch (err) {

        console.error("[CURRENT SESSION]", err);

        return res.status(500).json({
            success: false,
            message: "Unable to load current session."
        });

    }

};

export const revokeSession = async (req, res) => {

    try {

        await SessionRegistryService.revoke(
            req.params.sessionId
        );

        return res.json({
            success: true
        });

    } catch (err) {

        console.error("[REVOKE SESSION]", err);

        return res.status(500).json({
            success: false
        });

    }

};

export const revokeAllSessions = async (req, res) => {

    try {

        await SessionRegistryService.revokeAll(
            req.user.id
        );

        return res.json({
            success: true
        });

    } catch (err) {

        console.error("[REVOKE ALL]", err);

        return res.status(500).json({
            success: false
        });

    }

};
