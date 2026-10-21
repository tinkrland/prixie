#!/usr/bin/env python3
"""the retelldb seam for the recap branch.

ingests a recap transcript document into the persona's retelldb graph, then
answers capture requests: the exact pass happens in server/recap.ts (it
needs the raw timestamped segments); this script owns the meaning pass, via
the retelldb cli (`retelldb ingest`, `retelldb query`) over the synced
context copy in this repo.

usage:
    python3 scripts/recap_ingest.py ingest  --transcript recap_transcript.md \\
        --title "standup, oct 21" --url https://youtu.be/xyz --persona-id the owner
    python3 scripts/recap_ingest.py query  --query-text "the access code" \\
        --persona-id the owner
"""

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def run_retelldb(args: list[str]) -> str:
    """shell the retelldb cli in this repo (the synced context copy)."""
    result = subprocess.run(
        [sys.executable, "-m", "retelldb.cli", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"retelldb failed: {result.stderr.strip()}")
    return result.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="recap <-> retelldb seam")
    sub = parser.add_subparsers(dest="command", required=True)

    ingest = sub.add_parser("ingest", help="ingest a recap transcript as a document")
    ingest.add_argument("--transcript", required=True)
    ingest.add_argument("--title", required=True)
    ingest.add_argument("--url", required=True)
    ingest.add_argument("--persona-id", required=True)

    query = sub.add_parser("query", help="the meaning pass over the ingested session")
    query.add_argument("--query-text", required=True)
    query.add_argument("--persona-id", required=True)

    args = parser.parse_args()

    if args.command == "ingest":
        out = run_retelldb([
            "ingest",
            "--file-path", args.transcript,
            "--doc-format", "markdown",
            "--persona-id", args.persona_id,
            "--title", args.title,
            "--url", args.url,
        ])
        print(out or "ingested")
    else:
        out = run_retelldb([
            "query",
            "--query-text", args.query_text,
            "--persona-id", args.persona_id,
        ])
        print(out)


if __name__ == "__main__":
    main()
