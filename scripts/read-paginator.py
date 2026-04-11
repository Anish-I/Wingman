#!/usr/bin/env python3
"""PreToolUse hook: auto-paginate `Read` calls on large files.

When the assistant calls `Read` on a file >LARGE_FILE_LINES without an
explicit `offset` or `limit`, this hook injects `limit: PAGE_SIZE` so
only the head of the file is returned. The assistant then sees the
truncated read, notices the missing tail, and can call `Read` again
with `offset=...` for the parts it actually needs.

Net effect: a 4000-line file is no longer dumped at full size on
every cold exploration. Saves a meaningful slice of input tokens.

Silent on failure: if anything goes wrong, the hook returns an empty
JSON object (`{}`), which leaves the original tool input unchanged.

Tunables (env):
  READ_PAGINATOR_THRESHOLD   Lines before pagination kicks in (default 800)
  READ_PAGINATOR_PAGE_SIZE   Lines returned per slice (default 300)
  READ_PAGINATOR_LOG         Log file path (default ~/.cache/ccb/read-paginator.log)
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

LARGE_FILE_LINES = int(os.environ.get("READ_PAGINATOR_THRESHOLD", "800"))
PAGE_SIZE = int(os.environ.get("READ_PAGINATOR_PAGE_SIZE", "300"))
LOG_PATH = Path(
    os.environ.get("READ_PAGINATOR_LOG")
    or (Path.home() / ".cache" / "ccb" / "read-paginator.log")
)

# File extensions that Read returns specially (binary, image, PDF, notebook).
# We don't paginate those — let Read handle them.
SKIP_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
    ".pdf", ".ipynb",
    ".zip", ".gz", ".tar", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin",
}


def log(msg: str) -> None:
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}\n")
    except Exception:
        pass


def count_lines(path: Path) -> int:
    """Cheap line count. Returns -1 on failure."""
    try:
        n = 0
        with path.open("rb") as f:
            for _ in f:
                n += 1
        return n
    except Exception:
        return -1


def passthrough() -> None:
    """No-op response: leave the tool input unchanged."""
    sys.stdout.write("{}\n")
    sys.stdout.flush()


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        passthrough()
        return 0

    if payload.get("tool_name") != "Read":
        passthrough()
        return 0

    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path")
    if not file_path or not isinstance(file_path, str):
        passthrough()
        return 0

    # Already specified — respect it.
    if "offset" in tool_input or "limit" in tool_input:
        passthrough()
        return 0

    p = Path(file_path)
    if not p.exists() or not p.is_file():
        passthrough()
        return 0

    if p.suffix.lower() in SKIP_EXTS:
        passthrough()
        return 0

    line_count = count_lines(p)
    if line_count < 0 or line_count <= LARGE_FILE_LINES:
        passthrough()
        return 0

    # Inject pagination
    new_input = dict(tool_input)
    new_input["limit"] = PAGE_SIZE
    response = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": new_input,
        }
    }
    log(f"paginated {file_path} ({line_count} lines -> first {PAGE_SIZE})")
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
