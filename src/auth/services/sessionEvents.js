import eventStreamService from "../../services/eventStreamService.js";

class SessionEvents {

    static async created(session) {

        return eventStreamService.emit(
            "session.created",
            {
                sessionId: session.sessionId,
                userId: String(session.userId),
                status: session.status,
                device: session.device,
                network: session.network,
                createdAt: session.createdAt
            }
        );

    }

    static async revoked(session) {

        return eventStreamService.emit(
            "session.revoked",
            {
                sessionId: session.sessionId,
                userId: String(session.userId),
                status: session.status
            }
        );

    }

    static async logout(session) {

        return eventStreamService.emit(
            "session.logout",
            {
                sessionId: session.sessionId,
                userId: String(session.userId)
            }
        );

    }

    static async expired(session) {

        return eventStreamService.emit(
            "session.expired",
            {
                sessionId: session.sessionId,
                userId: String(session.userId)
            }
        );

    }

    static async otpVerified(session) {

        return eventStreamService.emit(
            "session.otp_verified",
            {
                sessionId: session.sessionId,
                userId: String(session.userId)
            }
        );

    }

    static async suspicious(session, reason) {

        return eventStreamService.emit(
            "session.suspicious",
            {
                sessionId: session.sessionId,
                userId: String(session.userId),
                reason
            }
        );

    }

}

export default SessionEvents;
