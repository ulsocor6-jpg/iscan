import Session from "../models/sessionModel.js";

class SessionRegistryService {

    static async getUserSessions(userId) {

        return Session.find({
            userId
        })
        .sort({
            lastSeenAt: -1
        })
        .lean();

    }

    static async getActiveSessions(userId) {

        return Session.find({
            userId,
            status: "ACTIVE"
        })
        .sort({
            lastSeenAt: -1
        })
        .lean();

    }

    static async getSession(sessionId) {

        return Session.findOne({
            sessionId
        }).lean();

    }

    static async revoke(sessionId) {

        return Session.findOneAndUpdate(
            {
                sessionId
            },
            {
                status: "REVOKED"
            },
            {
                new: true
            }
        );

    }

    static async revokeAll(userId) {

        return Session.updateMany(
            {
                userId,
                status: "ACTIVE"
            },
            {
                status: "REVOKED"
            }
        );

    }

    static async countActive(userId) {

        return Session.countDocuments({
            userId,
            status: "ACTIVE"
        });

    }

}

export default SessionRegistryService;
