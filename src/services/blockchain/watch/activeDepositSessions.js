// src/services/blockchain/watch/activeDepositSessions.js
//
// Tracks which chains currently have someone actively waiting on a deposit
// (i.e. they just opened the "Deposit Crypto" screen and got an address).
// blockchainEngine.js uses isActive(chain) to decide whether to poll that
// chain at the fast/active cadence or fall back to the slow/idle cadence.
//
// This does NOT remove addresses from addressFilter and does NOT stop a
// chain from being scanned entirely — crypto deposit addresses are
// permanent per-user addresses (confirmed via walletIndex assignment),
// so a deposit sent with no active session must still eventually be
// detected. This only controls how *often* that chain gets polled.

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min — auto-expires a stale session
                                        // even if confirm/clear never fires
                                        // (e.g. user closes tab, tx never sent)

class ActiveDepositSessions {

    constructor() {
        this._chains = new Map(); // chain -> Map<sessionKey, expiresAt>
    }

    /**
     * Mark a chain as having an active deposit session. Call this when a
     * user requests/views their deposit address for that chain.
     */
    markActive(chain, sessionKey, ttlMs = DEFAULT_TTL_MS) {

        if (!chain || !sessionKey) return;

        if (!this._chains.has(chain)) {
            this._chains.set(chain, new Map());
        }

        this._chains.get(chain).set(sessionKey, Date.now() + ttlMs);

    }

    /**
     * Clear a specific session — call this when the expected deposit is
     * confirmed, or the user cancels/leaves the deposit screen.
     */
    clear(chain, sessionKey) {

        this._chains.get(chain)?.delete(sessionKey);

    }

    /**
     * Is this chain currently in "active" mode (>=1 non-expired session)?
     * Lazily sweeps expired entries as a side effect.
     */
    isActive(chain) {

        const sessions = this._chains.get(chain);
        if (!sessions || sessions.size === 0) return false;

        const now = Date.now();

        for (const [key, expiresAt] of sessions) {
            if (expiresAt < now) sessions.delete(key);
        }

        return sessions.size > 0;

    }

    count(chain) {
        return this._chains.get(chain)?.size ?? 0;
    }

    snapshot() {
        return [...this._chains.keys()].map(chain => ({
            chain,
            active: this.isActive(chain),
            count: this.count(chain)
        }));
    }

}

export default new ActiveDepositSessions();
