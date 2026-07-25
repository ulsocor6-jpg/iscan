import { EventEmitter } from "events";

class BrainBus {
    constructor() {
        this._emitter = new EventEmitter();
        this._emitter.setMaxListeners(200);
        this._subscriberCount = new Map();
        this._started = false;
    }

    start() {
        if (this._started) return;
        this._started = true;
        console.log("[BrainBus] ⚡ System-wide message bus started");
        this.emit("system.health", {
            node: "BrainBus",
            status: "ONLINE",
            metrics: { startedAt: new Date() }
        });
    }

    stop() {
        this._started = false;
        this._emitter.removeAllListeners();
        this._subscriberCount.clear();
        console.log("[BrainBus] ⏹  Bus stopped");
    }

    emit(channel, payload, meta = {}) {
        const envelope = {
            channel,
            payload,
            meta: {
                timestamp: meta.timestamp || new Date().toISOString(),
                source: meta.source || "unknown",
                correlationId: meta.correlationId || null
            }
        };

        this._emitter.emit(channel, envelope);

        const parts = channel.split(".");
        for (let i = parts.length; i > 0; i--) {
            const wildcard = parts.slice(0, i).join(".") + ".*";
            this._emitter.emit(wildcard, envelope);
        }

        this._emitter.emit("*", envelope);
    }

    on(channel, handler) {
        this._emitter.on(channel, handler);
        this._subscriberCount.set(channel, (this._subscriberCount.get(channel) || 0) + 1);
        return () => this.off(channel, handler);
    }

    once(channel, handler) {
        this._emitter.once(channel, handler);
        return () => this.off(channel, handler);
    }

    off(channel, handler) {
        this._emitter.off(channel, handler);
        const count = this._subscriberCount.get(channel) || 0;
        if (count <= 1) {
            this._subscriberCount.delete(channel);
        } else {
            this._subscriberCount.set(channel, count - 1);
        }
    }

    getChannels() {
        const channels = [];
        for (const [channel, count] of this._subscriberCount) {
            channels.push({ channel, subscribers: count });
        }
        return channels.sort((a, b) => a.channel.localeCompare(b.channel));
    }

    dump() {
        console.log("\n[BrainBus] ── Subscription Map ──");
        const channels = this.getChannels();
        if (channels.length === 0) {
            console.log("  (no active subscriptions)");
        } else {
            for (const { channel, subscribers } of channels) {
                console.log(`  ${channel}  →  ${subscribers} listener(s)`);
            }
        }
        console.log("");

        return {
            started: this._started,
            channelCount: channels.length,
            channels
        };
    }
}

const brainBus = new BrainBus();
export default brainBus;
