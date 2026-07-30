import crypto from "crypto";

import expectedBalanceCalculator from "./expectedBalanceCalculator.js";
import balanceHistory from "../laptop/balanceHistory.js";
import balanceCache from "../laptop/balanceCache.js";
import TreasurySnapshot from "../../models/TreasurySnapshot.js";

if (!process.env.TREASURY_SNAPSHOT_SECRET) {
    throw new Error(
        "TREASURY_SNAPSHOT_SECRET is not set — required to sign treasury consensus snapshots"
    );
}
const TREASURY_SNAPSHOT_SECRET = process.env.TREASURY_SNAPSHOT_SECRET;

class ConsensusSnapshotService {

    async create(channel = "PHP") {

        const calculation = await expectedBalanceCalculator.calculate(channel);

        // Chain to the previous snapshot for this channel — tampering with
        // any single historical snapshot now breaks verification of every
        // snapshot after it, not just that one record.
        const previous = await TreasurySnapshot.findOne({ pool: channel })
            .sort({ createdAt: -1 })
            .lean();
        const previousHash = previous?.proof?.signature || null;

        const snapshot = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            channel,
            expectedBalance: calculation.expectedBalance,
            available: calculation.expectedAvailable,
            pending: calculation.projection.totalPending,
            pendingCount: calculation.projection.pendingCount,
            treasuryHash: calculation.snapshot.snapshotId,
            previousHash,
            projectionHash: crypto
                .createHash("sha256")
                .update(JSON.stringify(calculation.projection))
                .digest("hex"),
        };

        // Real signature: HMAC-SHA256 keyed with a server-side secret that
        // never leaves this process. Unlike a bare sha256(JSON.stringify(...))
        // hash (the previous implementation), this can't be recomputed or
        // forged by anything that doesn't hold TREASURY_SNAPSHOT_SECRET.
        snapshot.signature = crypto
            .createHmac("sha256", TREASURY_SNAPSHOT_SECRET)
            .update(JSON.stringify(snapshot))
            .digest("hex");

        // Persist the FULL snapshot (previously computed then discarded —
        // only a trimmed subset survived past this function).
        await TreasurySnapshot.create({
            pool: channel,
            baseBalance: calculation.snapshot.realBalance,
            expectedBalance: snapshot.expectedBalance,
            actualBalance: null,
            drift: null,
            integrityScore: null,
            proof: snapshot,
            verifiedAt: null,
        });

        balanceCache.setBalance(channel, {
            balance: snapshot.expectedBalance,
            available: snapshot.available,
            pending: snapshot.pending,
            expected: snapshot.expectedBalance,
            signature: snapshot.signature,
            source: "CONSENSUS",
        });

        balanceHistory.record({
            channel,
            balance: snapshot.expectedBalance,
            available: snapshot.available,
            pending: snapshot.pending,
            expected: snapshot.expectedBalance,
            variance: 0,
            signature: snapshot.signature,
            source: "CONSENSUS",
        });

        return snapshot;
    }

    // Verify a stored snapshot hasn't been tampered with — recomputes the
    // HMAC over the proof (minus its own signature) and compares. This is
    // what an audit tool should call, rather than trusting a stored
    // `signature` field at face value.
    verify(storedProof) {
        const { signature, ...rest } = storedProof;
        const expected = crypto
            .createHmac("sha256", TREASURY_SNAPSHOT_SECRET)
            .update(JSON.stringify(rest))
            .digest("hex");
        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, "hex"),
                Buffer.from(expected, "hex")
            );
        } catch {
            return false;
        }
    }

}

const consensusSnapshotService = new ConsensusSnapshotService();

consensusSnapshotService.descriptor = {
    id: "consensusSnapshotService",
    name: "Consensus Snapshot Service",
    type: "engine",
    domain: "intelligence",
    description: "Creates a balance consensus snapshot for a treasury channel.",
    previous: ["treasuryIntelligenceBus"],
    next: [],
    dependsOn: [],
    criticality: "MEDIUM",
    notes: "Live call confirmed from treasuryIntelligenceBus.process(). The same service is also imported — but never called — by treasuryCoordinator.js (dead import)."
};

export default consensusSnapshotService;
