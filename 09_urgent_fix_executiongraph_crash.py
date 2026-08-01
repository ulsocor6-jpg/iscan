#!/usr/bin/env python3
"""
Patch 9 (URGENT) — src/intelligence/platform/platformIntelligenceBus.js

Confirmed from your last boot log: publish() throws
"executionGraph.record is not a function" on EVERY blockchainInspector
event (treasury checks, recovery worker, pipeline events — all of them).
operatorSubscriber.js awaits publish() with no try/catch, so this becomes
an unhandled promise rejection AND, critically, happens before
incidentEngine.process() is ever reached in publish()'s code path. That
means incident creation has been silently broken since
missionControlAggregator.process()/executionGraph.record() were added —
including for the live USDC/USDT DEADLOCK events in your last log, which
should have raised CRITICAL incidents and didn't.

This wraps those two calls in try/catch so a failure in either can never
again block activityEngine.record() (already succeeded before them) or,
more importantly, the incidentEngine.process() call further down in the
same function. This does NOT fix executionGraph's actual API — that
belongs to whoever is building the missionControl/executionGraph feature
and needs their input on what .record() is supposed to do. This patch's
only job is to stop it from taking down incident creation in the
meantime.

Run from the repo root:
    python3 09_urgent_fix_executiongraph_crash.py
"""
import sys

PATH = "src/intelligence/platform/platformIntelligenceBus.js"

OLD = '''        architectureEventBridge.started("activityEngine");
        activityEngine.record(normalized);

        missionControlAggregator.process(
            normalized
        );

        executionGraph.record(normalized);
        architectureEventBridge.completed("activityEngine");'''

NEW = '''        architectureEventBridge.started("activityEngine");
        activityEngine.record(normalized);

        // Wrapped defensively — a failure in either of these must never
        // block incidentEngine.process() further down in this function.
        // executionGraph.record() was throwing "is not a function" on
        // every single event before this fix, which meant NO incidents
        // were being created at all, including real treasury DEADLOCKs.
        try {

            missionControlAggregator.process(
                normalized
            );

        } catch (err) {

            console.error(
                "[PlatformIntelligenceBus] missionControlAggregator.process() failed — non-fatal, continuing:",
                err.message
            );

        }

        try {

            executionGraph.record(normalized);

        } catch (err) {

            console.error(
                "[PlatformIntelligenceBus] executionGraph.record() failed — non-fatal, continuing:",
                err.message
            );

        }

        architectureEventBridge.completed("activityEngine");'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        content = f.read()

    count = content.count(OLD)
    if count != 1:
        print(f"ABORT: expected exactly 1 occurrence of anchor in {PATH}, found {count}")
        print("The file may have changed again since this script was written — paste")
        print("me the current publish() method body and I'll rebuild the anchor.")
        sys.exit(1)

    content = content.replace(OLD, NEW)

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"OK: patched {PATH}")
    print()
    print("NOTE: also add a try/catch around operatorSubscriber.js's")
    print("`await platformIntelligenceBus.publish(event)` call as defense in")
    print("depth — this patch stops the CURRENT known cause, but publish()")
    print("could still throw for other reasons in the future, and right now")
    print("that would silently kill incident creation again with no visible")
    print("error beyond an unhandled rejection in the logs.")


if __name__ == "__main__":
    main()
