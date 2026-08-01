#!/usr/bin/env python3
"""
Patch 7 — src/intelligence/architecture/architectureLoader.js

Root cause confirmed: architectureLoader.walk() does `await import()` on
every .js file under src/, sequentially. src/services/watcherManager.js has
a top-level `await watcherQueue.add(...)` (BullMQ) that depends on Redis
being reachable. When Redis isn't up (e.g. local dev without REDIS_URL
reachable), that await never resolves — so `import()` on that one file
hangs forever, and the entire scan stalls there permanently. This is why
architectureBootstrap.start() never printed "N components loaded" in
either the standalone test or the normal server boot.

This wraps each file's import() in a race against a timeout (default
3000ms, configurable via this.importTimeoutMs), so one hanging module can
no longer block the whole scan. Timed-out files are logged explicitly
(not silently swallowed like other errors) so this is discoverable if it
happens again with some other file in the future.

Run from the repo root:
    python3 07_fix_architecture_loader_hang.py
"""
import sys

PATH = "src/intelligence/architecture/architectureLoader.js"

OLD_CLASS_OPEN = '''class ArchitectureLoader {

    async load(root = "src") {'''

NEW_CLASS_OPEN = '''class ArchitectureLoader {

    constructor() {

        // A single hanging import() (e.g. a top-level await on an
        // unreachable Redis/queue connection) must not be able to stall
        // the entire architecture scan forever.
        this.importTimeoutMs = 3000;

    }

    async load(root = "src") {'''

OLD_IMPORT = '''                const mod = await import(
                    pathToFileURL(path.resolve(file)).href
                );'''

NEW_IMPORT = '''                const mod = await Promise.race([

                    import(
                        pathToFileURL(path.resolve(file)).href
                    ),

                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`import timed out after ${this.importTimeoutMs}ms`)),
                            this.importTimeoutMs
                        )
                    )

                ]);'''

OLD_CATCH = '''            } catch (err) {

                // Ignore modules requiring runtime state

            }'''

NEW_CATCH = '''            } catch (err) {

                if (String(err.message).includes("timed out")) {

                    console.warn(
                        `[ArchitectureLoader] Skipped ${file} — import() exceeded ${this.importTimeoutMs}ms (likely a top-level await on an unavailable connection, e.g. Redis).`
                    );

                }

                // Other errors: ignore modules requiring runtime state

            }'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        content = f.read()

    checks = [
        (OLD_CLASS_OPEN, "class-open"),
        (OLD_IMPORT, "import-call"),
        (OLD_CATCH, "catch-block"),
    ]

    for old, label in checks:
        count = content.count(old)
        if count != 1:
            print(f"ABORT: expected exactly 1 occurrence of {label} anchor in {PATH}, found {count}")
            print("No changes written.")
            sys.exit(1)

    content = content.replace(OLD_CLASS_OPEN, NEW_CLASS_OPEN)
    content = content.replace(OLD_IMPORT, NEW_IMPORT)
    content = content.replace(OLD_CATCH, NEW_CATCH)

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"OK: patched {PATH}")


if __name__ == "__main__":
    main()
