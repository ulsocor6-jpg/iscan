#!/usr/bin/env python3
"""
Patch: mount the UserTools floating widget in DashboardLayout.tsx so it
appears on every authenticated page.

Prereq: copy UserTools.tsx and UserTools.css into
        src/banking/components/  (same folder as DashboardLayout.tsx)
        before running this script.

Run from repo root:  python3 patch_wire_user_tools.py
"""
import sys
from pathlib import Path

def patch_file(path, replacements):
    p = Path(path)
    if not p.exists():
        print(f"ABORT: {path} does not exist")
        sys.exit(1)
    text = p.read_text()
    for old, new, label in replacements:
        count = text.count(old)
        if count == 0:
            print(f"ABORT: anchor not found in {path} — {label}")
            print("----- expected anchor -----")
            print(old)
            sys.exit(1)
        if count > 1:
            print(f"ABORT: anchor matched {count} times (expected 1) in {path} — {label}")
            sys.exit(1)
        text = text.replace(old, new)
    p.write_text(text)
    print(f"OK: patched {path}")


DL = "src/banking/components/DashboardLayout.tsx"

# require the two dropped-in files to actually be present first
for required in ["src/banking/components/UserTools.tsx", "src/banking/components/UserTools.css"]:
    if not Path(required).exists():
        print(f"ABORT: {required} not found — copy UserTools.tsx and UserTools.css "
              f"into src/banking/components/ before running this patch")
        sys.exit(1)

patch_file(DL, [
    (
        '''import Sidebar from "./Sidebar";
import Header from "./Header";
import ImpersonationBanner from "./ImpersonationBanner";
import { BackgroundProvider, useBackground } from "../../hooks/useBackground";''',
        '''import Sidebar from "./Sidebar";
import Header from "./Header";
import ImpersonationBanner from "./ImpersonationBanner";
import UserTools from "./UserTools";
import { BackgroundProvider, useBackground } from "../../hooks/useBackground";''',
        "import UserTools"
    ),
    (
        '''        <main className="main-content">
          <ImpersonationBanner />
          <Header />
          {children}
        </main>
      </div>
    </BackgroundProvider>''',
        '''        <main className="main-content">
          <ImpersonationBanner />
          <Header />
          {children}
        </main>
        <UserTools />
      </div>
    </BackgroundProvider>''',
        "mount UserTools inside layout"
    ),
])

print("\\nDone. Next: npm run build (or your dev server) to confirm it renders bottom-right on every page.")
