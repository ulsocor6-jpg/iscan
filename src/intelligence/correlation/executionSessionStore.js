class ExecutionSessionStore {

    constructor() {

        this.sessions = new Map();

    }

    save(session) {

        this.sessions.set(
            session.id,
            session
        );

        return session;

    }

    get(id) {

        return this.sessions.get(id);

    }

    append(id,event){

        const session =
            this.sessions.get(id);

        if(!session)
            return null;

        session.events.push(event);

        session.updatedAt =
            new Date();

        return session;

    }

    all(){

        return
            [...this.sessions.values()];

    }

}

export default new ExecutionSessionStore();
