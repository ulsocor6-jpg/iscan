import worldModel from "./worldModel.js";

class WorldObserver {

    observe(topic, value, metadata = {}) {

        worldModel.set(topic, {

            value,

            metadata,

            observedAt: Date.now()

        });

    }

    observed(topic) {

        return worldModel.get(topic);

    }

    update(topic, updater) {

        const current =
            worldModel.get(topic);

        const next =
            updater(current);

        this.observe(topic, next);

        return next;

    }

    remove(topic) {

        worldModel.delete(topic);

    }

}

export default new WorldObserver();
