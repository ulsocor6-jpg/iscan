import EventEmitter from "events";

class AddressFilter extends EventEmitter {

    constructor() {

        super();

        /**
         * address -> watch object
         */
        this.watchMap = new Map();

    }

    /**
     * Normalize address
     */
    normalize(address) {

        return address?.toLowerCase();

    }

    /**
     * Add watched address
     */
    add(watch) {

        if (!watch.address) {
            throw new Error("Watch address missing.");
        }

        this.watchMap.set(
            this.normalize(watch.address),
            watch
        );

        this.emit("watch_added", watch);

    }

    /**
     * Remove watched address
     */
    remove(address) {

        address = this.normalize(address);

        this.watchMap.delete(address);

        this.emit("watch_removed", address);

    }

    /**
     * Replace all watches
     */
    replace(list = []) {

        this.watchMap.clear();

        for (const watch of list) {

            this.watchMap.set(
                this.normalize(watch.address),
                watch
            );

        }

        this.emit("reload");

    }

    /**
     * Lookup
     */
    match(address) {

        return this.watchMap.get(
            this.normalize(address)
        ) || null;

    }

    /**
     * Exists?
     */
    has(address) {

        return this.watchMap.has(
            this.normalize(address)
        );

    }

    /**
     * Get all currently watched addresses (normalized)
     */
    getWatchedAddresses() {

        return [...this.watchMap.keys()];

    }

    /**
     * Count
     */
    size() {

        return this.watchMap.size;

    }

    /**
     * Debug
     */
    dump() {

        return [...this.watchMap.values()];

    }

}

export default new AddressFilter();
