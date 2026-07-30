import activityEngine from "./activityEngine.js";

class ActivityController {

    summary() {

        return activityEngine.getSummary();

    }

    sessions() {

        return activityEngine.getActiveSessions();

    }

    session(id) {

        return activityEngine.getSession(id);

    }

}

export default new ActivityController();
