#!/usr/bin/env python3
"""
Patch: hook remediationEngine.attemptRemediation() into operatorSubscriber.js
so incidents with a whitelisted code actually get an auto-remediation
attempt, instead of remediationEngine.js sitting there unused.

Fire-and-forget with its own catch — remediation attempts (and their
own internal errors) must never block or crash incident logging/
publishing, same pattern already used for eventStreamService.emit below.

Run from repo root:  python3 patch_wire_remediation_engine.py
"""
import sys
from pathlib import Path

def patch(path, old, new, label, already_marker):
    p = Path(path)
    if not p.exists():
        print(f"ABORT: {path} does not exist")
        sys.exit(1)
    text = p.read_text()
    if already_marker in text:
        print(f"  skip (already patched): {label}")
        return
    count = text.count(old)
    if count == 0:
        print(f"ABORT: anchor not found in {path} — {label}")
        print(repr(old))
        sys.exit(1)
    if count > 1:
        print(f"ABORT: anchor matched {count} times — {label}")
        sys.exit(1)
    p.write_text(text.replace(old, new))
    print(f"OK: {label}")


OS = "src/services/operator/operatorSubscriber.js"

patch(OS,
    '''import blockchainInspector from "../blockchain/inspector/blockchainInspector.js";
import eventStreamService from "../eventStreamService.js";
import incidentEngine from "./incidentEngine.js";''',
    '''import blockchainInspector from "../blockchain/inspector/blockchainInspector.js";
import eventStreamService from "../eventStreamService.js";
import incidentEngine from "./incidentEngine.js";
import remediationEngine from "./remediationEngine.js";''',
    "import remediationEngine",
    'import remediationEngine from "./remediationEngine.js"'
)

patch(OS,
    '''            } catch(err){

                console.error(
                    "[Operator] Failed to publish incident:",
                    err.message
                );

            }

        });''',
    '''            } catch(err){

                console.error(
                    "[Operator] Failed to publish incident:",
                    err.message
                );

            }

            // Fire-and-forget: attemptRemediation() is a no-op for any
            // code not in remediationEngine's WHITELIST, and it already
            // catches its own handler errors internally. Never let this
            // block or crash the event loop.
            remediationEngine.attemptRemediation(incident).catch((err) => {
                console.error(
                    "[Operator] Remediation attempt threw unexpectedly:",
                    err.message
                );
            });

        });''',
    "call attemptRemediation after publishing each incident",
    "remediationEngine.attemptRemediation(incident).catch("
)

print("\nDone. Next: node --check src/services/operator/operatorSubscriber.js, then git --no-pager diff.")
