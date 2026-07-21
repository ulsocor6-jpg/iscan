#!/usr/bin/env python3
"""
Patch: brighten UserTools widget colors for readability against the
dashboard's dark background.

Run from repo root:  python3 patch_brighten_user_tools.py
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


CSS = "src/banking/components/UserTools.css"

patch_file(CSS, [
    (
        '''.user-tools-toggle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #10192e;
  color: #e8ecf5;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  transition: transform 0.15s ease, background 0.15s ease;
}

.user-tools-toggle:hover {
  background: #16223d;
  transform: translateY(-1px);
}''',
        '''.user-tools-toggle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: #2d3f68;
  color: #ffffff;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  transition: transform 0.15s ease, background 0.15s ease;
}

.user-tools-toggle:hover {
  background: #37497a;
  transform: translateY(-1px);
}''',
        "brighten toggle button"
    ),
    (
        '''.user-tools-panel {
  width: 340px;
  max-width: calc(100vw - 48px);
  height: 460px;
  max-height: calc(100vh - 140px);
  background: #0b1424;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}''',
        '''.user-tools-panel {
  width: 340px;
  max-width: calc(100vw - 48px);
  height: 460px;
  max-height: calc(100vh - 140px);
  background: #182645;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}''',
        "brighten panel background + border"
    ),
    (
        '''.user-tools-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.user-tools-title {
  color: #f2f5fb;
  font-weight: 600;
  font-size: 14px;
}

.user-tools-subtitle {
  color: #8b94a8;
  font-size: 12px;
  margin-top: 2px;
}

.user-tools-close {
  background: none;
  border: none;
  color: #8b94a8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
}

.user-tools-close:hover {
  color: #e8ecf5;
}''',
        '''.user-tools-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  background: #1e2f54;
}

.user-tools-title {
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
}

.user-tools-subtitle {
  color: #b7c0d8;
  font-size: 12px;
  margin-top: 2px;
}

.user-tools-close {
  background: none;
  border: none;
  color: #b7c0d8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
}

.user-tools-close:hover {
  color: #ffffff;
}''',
        "brighten header text + separate header background"
    ),
    (
        '''.user-tools-msg-assistant {
  align-self: flex-start;
  background: #16223d;
  color: #dde3f0;
  border-bottom-left-radius: 4px;
}

.user-tools-msg-user {
  align-self: flex-end;
  background: #5b8def;
  color: #0b1424;
  border-bottom-right-radius: 4px;
}''',
        '''.user-tools-msg-assistant {
  align-self: flex-start;
  background: #26385f;
  color: #f5f8ff;
  border-bottom-left-radius: 4px;
}

.user-tools-msg-user {
  align-self: flex-end;
  background: #7ba6ff;
  color: #0b1424;
  font-weight: 500;
  border-bottom-right-radius: 4px;
}''',
        "brighten message bubbles"
    ),
    (
        '''.user-tools-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.user-tools-input {
  flex: 1;
  resize: none;
  background: #10192e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #f2f5fb;
  font-size: 13px;
  font-family: inherit;
  padding: 9px 11px;
  max-height: 100px;
}

.user-tools-input:focus {
  outline: none;
  border-color: #5b8def;
}

.user-tools-input::placeholder {
  color: #62697c;
}

.user-tools-send {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: #5b8def;
  color: #0b1424;
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
}''',
        '''.user-tools-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  background: #1e2f54;
}

.user-tools-input {
  flex: 1;
  resize: none;
  background: #22345a;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  padding: 9px 11px;
  max-height: 100px;
}

.user-tools-input:focus {
  outline: none;
  border-color: #7ba6ff;
}

.user-tools-input::placeholder {
  color: #9aa4bd;
}

.user-tools-send {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: #7ba6ff;
  color: #0b1424;
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
}''',
        "brighten input row + send button"
    ),
])

print("\\nDone. Refresh your dev server (hot reload should pick it up automatically).")
