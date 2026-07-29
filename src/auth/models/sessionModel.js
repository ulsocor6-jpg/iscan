import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
{
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    status: {
        type: String,
        enum: [
            "ACTIVE",
            "REVOKED",
            "EXPIRED",
            "LOGGED_OUT"
        ],
        default: "ACTIVE",
        index: true
    },

    device: {

        fingerprint: String,

        browser: String,

        os: String,

        platform: String,

        userAgent: String
    },

    network: {

        ip: String,

        country: String,

        city: String
    },

    verification: {

        emailVerified: {
            type: Boolean,
            default: false
        },

        phoneVerified: {
            type: Boolean,
            default: false
        },

        otpVerified: {
            type: Boolean,
            default: false
        }
    },

    security: {

        refreshTokenHash: String,

        riskScore: {
            type: Number,
            default: 0
        }
    },

    lastSeenAt: {
        type: Date,
        default: Date.now
    },

    expiresAt: {
        type: Date,
        required: true,
        index: true
    }

},
{
    timestamps: true
});

sessionSchema.index(
{
    expiresAt: 1
},
{
    expireAfterSeconds: 0
});

export default mongoose.model(
    "Session",
    sessionSchema
);
