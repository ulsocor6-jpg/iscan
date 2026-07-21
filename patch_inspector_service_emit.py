#!/usr/bin/env python3
"""
Patch: emit a blockchainInspector event when a PHP_DEPOSIT flow stage fails,
so Inspector-model failures flow into the same incidentEngine pipeline that
already handles blockchain incidents.

Idempotent — safe to re-run, skips anything already patched.
Run from repo root:  python3 patch_inspector_service_emit.py
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
        print(f"SKIP ({label}): already patched")
        return
    if text.count(old) != 1:
        print(f"ABORT ({label}): anchor not found exactly once ({text.count(old)} matches)")
        sys.exit(1)
    p.write_text(text.replace(old, new))
    print(f"OK ({label})")

patch(
    "src/services/inspectorService.js",
    'import Inspector from "../models/inspectorModel.js";',
    'import Inspector from "../models/inspectorModel.js";\nimport blockchainInspector from "./blockchain/inspector/blockchainInspector.js";',
    "add blockchainInspector import",
    'import blockchainInspector from "./blockchain/inspector/blockchainInspector.js";'
)

old_block = '''        stage.decision = decision;

        flow.status = "FAILED";

        await flow.save();

        return flow;

    }

    async skipStage('''

new_block = '''        stage.decision = decision;

        flow.status = "FAILED";

        await flow.save();

        // Bridge into the same event stream blockchain incidents use, so
        // PHP_DEPOSIT stage failures reach incidentEngine too.
        blockchainInspector.error(
            stageName,
            error,
            {
                flowId,
                pipeline: flow.pipeline,
                referenceId: flow.referenceId,
                source: flow.source
            }
        );

        return flow;

    }

    async skipStage('''

patch(
    "src/services/inspectorService.js",
    old_block,
    new_block,
    "emit on failStage",
    "// Bridge into the same event stream"
)

print("Done. Review with: git --no-pager diff")
