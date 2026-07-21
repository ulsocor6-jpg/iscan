#!/usr/bin/env python3
import sys
from pathlib import Path

path = Path("src/services/operator/operatorSubscriber.js")
text = path.read_text()

marker = "remediationEngine"
if marker in text:
    print("SKIP: already patched")
    sys.exit(0)

old_import = 'import incidentEngine from "./incidentEngine.js";'
new_import = '''import incidentEngine from "./incidentEngine.js";
import remediationEngine from "./remediationEngine.js";'''

if text.count(old_import) != 1:
    print(f"ABORT: import anchor not found exactly once ({text.count(old_import)} matches)")
    sys.exit(1)
text = text.replace(old_import, new_import)

old_tail = '''            } catch(err){
                console.error(
                    "[Operator] Failed to publish incident:",
                    err.message
                );
            }
        });
    }
}'''

new_tail = '''            } catch(err){
                console.error(
                    "[Operator] Failed to publish incident:",
                    err.message
                );
            }

            // Attempt auto-remediation only for whitelisted incident codes.
            // No-op (and no log) for anything not explicitly whitelisted.
            await remediationEngine.attemptRemediation(incident);
        });
    }
}'''

if text.count(old_tail) != 1:
    print(f"ABORT: tail anchor not found exactly once ({text.count(old_tail)} matches)")
    sys.exit(1)
text = text.replace(old_tail, new_tail)

path.write_text(text)
print("OK: remediationEngine wired into operatorSubscriber")
