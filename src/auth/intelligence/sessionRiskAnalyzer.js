/**
 * Session Risk Analyzer
 *
 * Produces a normalized risk score (0-100)
 * together with reasons that explain why.
 *
 * This file intentionally contains no external
 * dependencies so it can be reused everywhere.
 */

class SessionRiskAnalyzer {

    analyze(context = {}, previous = {}) {

        let score = 0;
        const reasons = [];

        //-------------------------------------------------
        // Missing fingerprint
        //-------------------------------------------------

        if (!context.metadata?.fingerprint) {
            score += 20;
            reasons.push("Missing device fingerprint");
        }

        //-------------------------------------------------
        // IP changed
        //-------------------------------------------------

        if (
            previous.ip &&
            context.ip &&
            previous.ip !== context.ip
        ) {
            score += 25;
            reasons.push("IP address changed");
        }

        //-------------------------------------------------
        // Browser changed
        //-------------------------------------------------

        if (
            previous.userAgent &&
            context.userAgent &&
            previous.userAgent !== context.userAgent
        ) {
            score += 20;
            reasons.push("Browser changed");
        }

        //-------------------------------------------------
        // Timezone changed
        //-------------------------------------------------

        if (
            previous.timezone &&
            context.timezone &&
            previous.timezone !== context.timezone
        ) {
            score += 10;
            reasons.push("Timezone changed");
        }

        //-------------------------------------------------
        // Brand new session
        //-------------------------------------------------

        if (!previous.sessionId) {
            score += 5;
            reasons.push("New session");
        }

        //-------------------------------------------------
        // Normalize
        //-------------------------------------------------

        score = Math.min(score,100);

        let level = "LOW";

        if (score >= 75)
            level = "CRITICAL";
        else if (score >= 50)
            level = "HIGH";
        else if (score >= 25)
            level = "MEDIUM";

        return {

            score,

            level,

            trusted: score < 25,

            reasons

        };

    }

}

export default new SessionRiskAnalyzer();
