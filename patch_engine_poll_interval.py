#!/usr/bin/env python3
"""
Patches src/services/blockchain/collector/blockchainEngine.js:

POLL_INTERVAL was 1000ms — every chain gets a fresh provider.getBlockNumber()
call every single second, forever, even when there's nothing new to scan.
For N registered chains that's N calls/sec = N * 86,400 calls/day just to
check "is there anything new yet" — almost certainly the dominant source of
RPC compute usage, well before the getLogs work even factors in.

Nothing about deposit monitoring needs sub-second latency — increased to
15 seconds, a ~15x reduction in polling overhead with no meaningful impact
on deposit detection speed (users won't notice a <15s difference waiting
for a blockchain deposit to register).

Run from your project root (~/Desktop/iscansystem):
    python3 patch_engine_poll_interval.py
"""
import sys
from pathlib import Path

TARGET = Path("src/services/blockchain/collector/blockchainEngine.js")

OLD = "const POLL_INTERVAL = 1000;"
NEW = "const POLL_INTERVAL = 15000; // was 1000ms — that meant a getBlockNumber() call every second per chain, forever, even when idle. 15s is still fast enough for deposit monitoring and cuts polling-overhead RPC usage by ~15x."


def main():
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found.")
        sys.exit(1)
    text = TARGET.read_text(encoding="utf-8")
    if NEW in text:
        print("Already patched.")
        return
    if OLD not in text:
        print("ERROR: expected text not found — check the file manually.")
        sys.exit(1)
    backup = TARGET.with_suffix(TARGET.suffix + ".bak")
    backup.write_text(text, encoding="utf-8")
    TARGET.write_text(text.replace(OLD, NEW), encoding="utf-8")
    print(f"Patched {TARGET} (backup: {backup})")


if __name__ == "__main__":
    main()
