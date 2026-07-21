#!/usr/bin/env python3
"""
Temporary debugging patch: log the real error when the LLM call fails,
instead of silently falling back to a generic message. Once we've
diagnosed the issue, this can stay (server-side console.error is fine
long-term) or be swapped for inspector.warn/error if you want it visible
in the operator too.

Run from repo root:  python3 patch_debug_llm_error.py
"""
import sys
from pathlib import Path

SC = "src/controllers/supportController.js"
p = Path(SC)
text = p.read_text()

old = '''    } catch (llmErr) {
      return res.json({
        success: true,
        text: `I found ${resolved.record.reference} (status: ${resolved.record.status}), but I'm having trouble answering right now. Please try again shortly.`,
        reference,
      });
    }'''

new = '''    } catch (llmErr) {
      console.error("[support/chat] LLM call failed:", llmErr.message);
      return res.json({
        success: true,
        text: `I found ${resolved.record.reference} (status: ${resolved.record.status}), but I'm having trouble answering right now. Please try again shortly.`,
        reference,
      });
    }'''

count = text.count(old)
if count == 0:
    print("ABORT: anchor not found — file may already differ from expected")
    sys.exit(1)
if count > 1:
    print(f"ABORT: matched {count} times, expected 1")
    sys.exit(1)

p.write_text(text.replace(old, new))
print(f"OK: added error logging to {SC}")
print("Restart the server, re-run the curl test, and check the server's")
print("console output for the '[support/chat] LLM call failed:' line.")
