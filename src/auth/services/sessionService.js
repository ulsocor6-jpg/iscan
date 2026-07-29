import crypto from "crypto";
import Session from "../models/sessionModel.js";

const ONE_DAY = 1000 * 60 * 60 * 24;

class SessionService {

    static generateSessionId() {
        return crypto.randomUUID();
    }

    static async createSession({

        userId,

        fingerprint = "",

        browser = "",

        os = "",

        platform = "",

        userAgent = "",

        ip = "",

        country = "",

        city = "",

        emailVerified = false,

        phoneVerified = false,

        otpVerified = false,

        refreshTokenHash = null,

        expiresIn = ONE_DAY

    }) {

        const sessionId = this.generateSessionId();

        const expiresAt = new Date(
            Date.now() + expiresIn
        );

        const session = await Session.create({

            sessionId,

            userId,

            status: "ACTIVE",

            device: {

                fingerprint,

                browser,

                os,

                platform,

                userAgent

            },

            network: {

                ip,

                country,

                city

            },

            verification: {

                emailVerified,

                phoneVerified,

                otpVerified

            },

            security: {

                refreshTokenHash,

                riskScore: 0

            },

            lastSeenAt: new Date(),

            expiresAt

        });

        return session;

    }

    static async findSession(sessionId) {

        return Session.findOne({

            sessionId

        });

    }

    static async touchSession(sessionId) {

        return Session.findOneAndUpdate(

            {

                sessionId,

                status: "ACTIVE"

            },

            {

                lastSeenAt: new Date()

            },

            {

                returnDocument: 'after'

            }

        );

    }

    static async revokeSession(sessionId) {

        return Session.findOneAndUpdate(

            {

                sessionId

            },

            {

                status: "REVOKED"

            },

            {

                returnDocument: 'after'

            }

        );

    }

    static async logoutSession(sessionId) {

        return Session.findOneAndUpdate(

            {

                sessionId

            },

            {

                status: "LOGGED_OUT"

            },

            {

                returnDocument: 'after'

            }

        );

    }

    static async revokeAllUserSessions(userId) {

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

}

export default SessionService;
