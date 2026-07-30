class ActivityRegistry {

    constructor() {
        this.sessions = new Map();
    }

    update(event = {}) {

        const sessionId =
            event.session?.id ||
            event.sessionId ||
            event.metadata?.sessionId ||
            "SYSTEM";

        let session =
            this.sessions.get(sessionId);

        if (!session) {

            session = {
                id: sessionId,
                userId: event.userId || event.metadata?.userId || null,
                stage: event.stage || "unknown",
                status: "ACTIVE",
                startedAt: new Date(),
                updatedAt: new Date(),
                events: []
            };

            this.sessions.set(sessionId, session);
        }

        session.stage = event.stage || session.stage;
        session.updatedAt = new Date();
        session.lastEvent = event.type || null;

        session.events.push({
            timestamp: new Date(),
            stage: event.stage,
            type: event.type,
            level: event.level,
            message: event.message
        });

        if (session.events.length > 100) {
            session.events.shift();
        }

        return session;
    }

    finish(sessionId) {

        const session = this.sessions.get(sessionId);

        if (!session) {
            return null;
        }

        session.status = "COMPLETE";
        session.updatedAt = new Date();

        return session;
    }

    list() {
        return [...this.sessions.values()];
    }

    active() {
        return this.list().filter(s => s.status === "ACTIVE");
    }

    summary() {

        const active = this.active();

        return {
            online: active.length,
            processing: active.filter(s => s.stage !== "idle").length,
            completed: this.list().filter(s => s.status === "COMPLETE").length
        };
    }

}

export default new ActivityRegistry();
