class CorrelationRepository {

    constructor() {

        this.sessions = new Map();

    }

    get(id) {

        return this.sessions.get(id) || null;

    }

    save(session) {

        this.sessions.set(session.id, session);

        return session;

    }

    remove(id) {

        this.sessions.delete(id);

    }

    all() {

        return [...this.sessions.values()];

    }

    clear() {

        this.sessions.clear();

    }

}

export default new CorrelationRepository();
