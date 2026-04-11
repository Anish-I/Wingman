#!/usr/bin/env python3
"""Stop hook: delegates Obsidian thread-entry writes to Gemma 4 via Ollama.

Reads the Stop hook JSON payload from stdin (contains transcript_path),
extracts the last user + assistant turn, asks gemma4:e4b to summarize
into a structured JSON, and prepends the formatted entry to today's
Threads/<date>.md file. Silent failure: never blocks the session.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

VAULT = Path(os.environ.get("OBSIDIAN_VAULT", r"C:\Users\ivatu\ObsidianVault\Wingman"))
THREADS_DIR = VAULT / "Threads"
TOPICS_DIR = VAULT / "Topics"
LOG_PATH = Path.home() / ".cache" / "ccb" / "gemma4-writer.log"
MODEL = os.environ.get("GEMMA4_MODEL", "gemma4:e4b")
TIMEOUT_S = int(os.environ.get("GEMMA4_TIMEOUT_S", "120"))
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")


def log(msg: str) -> None:
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            ts = datetime.now().isoformat(timespec="seconds")
            f.write(f"[{ts}] {msg}\n")
    except Exception:
        pass


def _extract_text_parts(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                t = c.get("text", "")
                if isinstance(t, str):
                    parts.append(t)
        return "\n".join(parts)
    return ""


def read_transcript(path: Path) -> tuple[str, str]:
    """Return (last_user_msg, last_assistant_msg), trimmed."""
    last_user, last_asst = "", ""
    try:
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            raw = raw.strip()
            if not raw:
                continue
            try:
                rec = json.loads(raw)
            except Exception:
                continue
            t = rec.get("type")
            msg = rec.get("message") or {}
            text = _extract_text_parts(msg.get("content"))
            if not text.strip():
                continue
            if t == "user":
                last_user = text
            elif t == "assistant":
                last_asst = text
    except Exception as e:
        log(f"transcript read failed: {e}")
    return last_user[-3000:], last_asst[-3000:]


def list_topics() -> list[str]:
    try:
        return sorted(p.stem for p in TOPICS_DIR.glob("*.md"))
    except Exception:
        return []


def call_gemma(prompt: str) -> str | None:
    """Call Ollama HTTP API directly. Avoids ANSI noise from `ollama run` CLI."""
    body = json.dumps(
        {"model": MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_HOST.rstrip('/')}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            data = json.loads(r.read().decode("utf-8"))
            return data.get("response") or ""
    except urllib.error.HTTPError as e:
        log(f"ollama http {e.code}: {e.reason}")
        return None
    except urllib.error.URLError as e:
        log(f"ollama unreachable: {e.reason}")
        return None
    except TimeoutError:
        log("ollama timeout")
        return None
    except Exception as e:
        log(f"ollama call failed: {e}")
        return None


def parse_json_block(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def build_entry(
    now: datetime, user_summary: str, action: str, result: str, topics: list[str]
) -> str:
    lines = [
        f"## {now.strftime('%H:%M')}",
        f"**User:** {user_summary}",
        f"**Action:** {action}",
        f"**Result:** {result}",
    ]
    if topics:
        lines.append("**Topics:** " + ", ".join(f"[[{t}]]" for t in topics))
    return "\n".join(lines) + "\n\n"


def append_thread(entry: str, now: datetime) -> None:
    try:
        THREADS_DIR.mkdir(parents=True, exist_ok=True)
        thread_file = THREADS_DIR / f"{now.strftime('%Y-%m-%d')}.md"
        existing = thread_file.read_text(encoding="utf-8") if thread_file.exists() else ""
        thread_file.write_text(entry + existing, encoding="utf-8")
        log(f"appended entry to {thread_file}")
    except Exception as e:
        log(f"append failed: {e}")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    transcript_path = (
        payload.get("transcript_path")
        or payload.get("session_transcript_path")
        or ""
    )
    if not transcript_path or not Path(transcript_path).exists():
        log(f"no transcript: {transcript_path!r}")
        return 0

    user_msg, asst_msg = read_transcript(Path(transcript_path))
    if not user_msg.strip() or not asst_msg.strip():
        log("empty user/assistant msg")
        return 0

    topics = list_topics()
    topic_hint = ", ".join(topics) if topics else "(none yet)"

    prompt = f"""You summarize one Claude Code conversation turn into an Obsidian thread entry.

USER MESSAGE:
{user_msg}

ASSISTANT REPLY:
{asst_msg}

EXISTING TOPIC NODES (only link these, do not invent new ones):
{topic_hint}

Output ONLY one JSON object on a single line. No prose, no code fences. Schema:
{{"user_summary": "<one sentence on what user asked>", "action": "<one sentence on what assistant did>", "result": "<one sentence outcome>", "topics": ["TopicA", "TopicB"]}}

Topics: 0 to 4 entries, exact strings from the EXISTING TOPIC NODES list (no brackets). Skip if none fit."""

    raw = call_gemma(prompt)
    if not raw:
        return 0

    parsed = parse_json_block(raw)
    if not parsed:
        log(f"parse failed: {raw[:300]}")
        return 0

    valid_topics = [
        t for t in (parsed.get("topics") or []) if isinstance(t, str) and t in topics
    ][:4]

    now = datetime.now()
    entry = build_entry(
        now,
        str(parsed.get("user_summary", "")).strip() or "(no summary)",
        str(parsed.get("action", "")).strip() or "(no action)",
        str(parsed.get("result", "")).strip() or "(no result)",
        valid_topics,
    )
    append_thread(entry, now)
    return 0


if __name__ == "__main__":
    sys.exit(main())
