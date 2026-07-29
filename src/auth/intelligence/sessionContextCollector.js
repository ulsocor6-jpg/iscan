import os from "os";

/**
 * Builds a normalized session context.
 * This is intentionally lightweight.
 * Risk engines and AI consume this object.
 */

class SessionContextCollector {

    collect(req = {}, session = {}) {

        const headers = req.headers || {};

        const ip =
            headers["cf-connecting-ip"] ||
            headers["x-real-ip"] ||
            headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.ip ||
            null;

        const userAgent =
            headers["user-agent"] ||
            "Unknown";

        return {

            sessionId:
                session.sessionId ||
                session._id ||
                null,

            userId:
                session.userId ||
                null,

            createdAt:
                session.createdAt ||
                new Date(),

            ip,

            userAgent,

            acceptLanguage:
                headers["accept-language"] || null,

            platform:
                os.platform(),

            hostname:
                os.hostname(),

            timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone,

            metadata: {

                fingerprint:
                    headers["x-device-fingerprint"] ||
                    null,

                origin:
                    headers.origin ||
                    null,

                referer:
                    headers.referer ||
                    null
            }
        };

    }

}

export default new SessionContextCollector();
