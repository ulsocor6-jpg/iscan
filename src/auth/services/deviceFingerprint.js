import crypto from "crypto";

function sha256(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function normalize(value = "") {
    return String(value)
        .trim()
        .toLowerCase();
}

function getClientIp(req) {

    const forwarded = req.headers["x-forwarded-for"];

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return (
        req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        ""
    );
}

function buildFingerprint(req) {

    const userAgent = normalize(
        req.headers["user-agent"]
    );

    const language = normalize(
        req.headers["accept-language"]
    );

    const platform = normalize(
        req.headers["sec-ch-ua-platform"]
    );

    const mobile = normalize(
        req.headers["sec-ch-ua-mobile"]
    );

    const ip = normalize(
        getClientIp(req)
    );

    const raw = [

        userAgent,

        language,

        platform,

        mobile,

        ip

    ].join("|");

    return {

        fingerprint: sha256(raw),

        browser: userAgent,

        os: platform,

        platform,

        language,

        mobile,

        ip,

        userAgent

    };

}

export default buildFingerprint;
