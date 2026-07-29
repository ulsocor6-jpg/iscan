class SecurityPolicyEngine {

    static async canCreateSession(user, activeSessions = []) {

        return {
            allowed: true,
            revokeExisting: activeSessions.length > 0,
            reason: null
        };

    }

    static async canLogin(user) {

        if (!user) {

            return {
                allowed: false,
                reason: "USER_NOT_FOUND"
            };

        }

        if (user.status === "DEACTIVATED") {

            return {
                allowed: false,
                reason: "ACCOUNT_DEACTIVATED"
            };

        }

        if (user.status === "LOCKED") {

            return {
                allowed: false,
                reason: "ACCOUNT_LOCKED"
            };

        }

        return {
            allowed: true,
            reason: null
        };

    }

    static async requireOtp(user) {

        return !!user.phoneVerified;

    }

    static async requireReauthentication() {

        return true;

    }

}

export default SecurityPolicyEngine;
