// src/hooks/useSystemStream.ts
// Single shared EventSource for the whole app. Components subscribe by
// event-type prefix and only re-render/refetch when a matching event
// arrives — no polling, no timers. Also tracks rolling per-type counts
// so Intelligence Core can read activity-volume signals.

import { useEffect, useRef, useState } from "react";

interface StreamEvent {
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

type Listener = (evt: StreamEvent) => void;

class SystemStreamBus {
  private es: EventSource | null = null;
  private listeners = new Set<Listener>();
  private counts = new Map<string, number[]>();
  private readonly WINDOW_MS = 60_000;

  connect() {
    if (this.es) return;
    this.es = new EventSource("/api/v1/dashboard/stream");
    this.es.onmessage = (msg) => {
      try {
        const evt: StreamEvent = JSON.parse(msg.data);
        this.recordCount(evt.type);
        this.listeners.forEach((fn) => fn(evt));
      } catch {}
    };
    this.es.onerror = () => {};
  }

  private recordCount(type: string) {
    const now = Date.now();
    const arr = (this.counts.get(type) || []).filter((t) => now - t < this.WINDOW_MS);
    arr.push(now);
    this.counts.set(type, arr);
  }

  getRate(typePrefix: string): number {
    const now = Date.now();
    let total = 0;
    for (const [type, arr] of this.counts.entries()) {
      if (type.startsWith(typePrefix)) {
        total += arr.filter((t) => now - t < this.WINDOW_MS).length;
      }
    }
    return total;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

const bus = new SystemStreamBus();

// Matches either a direct event type (e.g. "withdrawal.completed") or a
// blockchain-bridged event carrying that category in its payload (e.g.
// type "blockchain.php-deposit" with data.category === "deposit"). Deposits
// currently only flow through the bridge path; withdrawals use both.
function matchesCategory(evt: StreamEvent, category: string): boolean {
  if (evt.type.startsWith(`${category}.`)) return true;
  if (evt.type.startsWith("blockchain.") && evt.data?.category === category) return true;
  return false;
}

export function useSystemStream(category: string, onEvent: Listener) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    bus.connect();
    return bus.subscribe((evt) => {
      if (category === "" || matchesCategory(evt, category)) {
        cbRef.current(evt);
      }
    });
  }, [category]);
}

export function useEventRate(typePrefix: string, refreshMs = 2000) {
  const [rate, setRate] = useState(0);
  useEffect(() => {
    bus.connect();
    const id = setInterval(() => setRate(bus.getRate(typePrefix)), refreshMs);
    return () => clearInterval(id);
  }, [typePrefix, refreshMs]);
  return rate;
}
