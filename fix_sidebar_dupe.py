import sys

path = sys.argv[1] if len(sys.argv) > 1 else "src/banking/components/Sidebar.tsx"

with open(path, "r") as f:
    content = f.read()

old = '''{label:"🔬 Inspector",path:"/inspector"},
{label:"🛰️ Mission Control",path:"/admin/mission-control"},
{label:"🖥 Operator",path:"/admin/operator"}'''

new = '''{label:"🔬 Inspector",path:"/inspector"},
{label:"🖥 Operator",path:"/admin/operator"}'''

if old not in content:
    print("ABORT: anchor text not found — file may have changed since last view. No edit made.")
    sys.exit(1)

if content.count(old) != 1:
    print(f"ABORT: anchor text matched {content.count(old)} times, expected exactly 1. No edit made.")
    sys.exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("OK: removed duplicate '🛰️ Mission Control' entry.")
