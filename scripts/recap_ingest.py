#!/usr/bin/env python3
"""the retelldb seam for the recap branch.

ingests a recap transcript document into the persona's retelldb graph, then
answers capture requests: the exact pass happens in server/recap.ts (it
needs the raw timestamped segments); this script owns the meaning pass, via
the embedded retelldb sdk over the synced context copy in this repo.

why the sdk and not the cli: the cli's --url flag is the REMOTE SERVER url,
so the recording's url belongs in source_uri, a different argument
entirely. the embedded sdk takes them both without that collision.

usage:
    python3 scripts/recap_ingest.py ingest  --transcript recap_transcript.md \\
        --title "standup, oct 21" --url https://youtu.be/xyz --persona-id the owner
    python3 scripts/recap_ingest.py query  --query-text "the access code" \\
        --persona-id the owner
"""

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from retelldb.client import RetellDB  # noqa: E402


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
    client = RetellDB()

    if args.command == "ingest":
        content = Path(args.transcript).read_text(encoding="utf-8")
        resp = client.ingest(
            content=content,
            format="markdown",
            persona_id=args.persona_id,
            title=args.title,
            source_uri=args.url,
        )
        print(f"ingested: {resp.graph}")
    else:
        resp = client.query(
            query=args.query_text,
            persona_id=args.persona_id,
        )
        if not resp.nodes:
            # empty output is the honest "no meaning pass hit": the
            # recap side treats blank stdout as null, never a guess.
            print("")
            return
        for sn in resp.nodes:
            print(f"{sn.node.title}: {getattr(sn.node, 'content', '')}")


if __name__ == "__main__":
    main()
