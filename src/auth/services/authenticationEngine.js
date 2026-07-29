import SessionService from "./sessionService.js";
import SessionRegistryService from "./sessionRegistryService.js";
import SecurityPolicyEngine from "./securityPolicyEngine.js";
import buildFingerprint from "./deviceFingerprint.js";
import SessionEvents from "./sessionEvents.js";

class AuthenticationEngine {

    static async login({
        user,
        req
    }) {

        const policy = await SecurityPolicyEngine.canLogin(user);

        if (!policy.allowed) {
            throw new Error(policy.reason);
        }

        const activeSessions =
            await SessionRegistryService.getActiveSessions(
                user._id
            );

        const sessionPolicy =
            await SecurityPolicyEngine.canCreateSession(
                user,
                activeSessions
            );

        if (sessionPolicy.revokeExisting) {

            await SessionService.revokeAllUserSessions(
                user._id
            );

        }

        const device =
            buildFingerprint(req);

        const session =
            await SessionService.createSession({

                userId: user._id,

                fingerprint: device.fingerprint,

                browser: device.browser,

                os: device.os,

                platform: device.platform,

                userAgent: device.userAgent,

                ip: device.ip,

                emailVerified: user.isVerified,

                phoneVerified: !!user.phoneVerified

            });

        await SessionEvents.created(session);

        return session;

    }

}

export default AuthenticationEngine;
