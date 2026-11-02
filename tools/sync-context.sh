#!/bin/sh
# pull the persona context from the context branch into a surface branch.
# the context branch owns persona/ and the retelldb pin; every surface branch
# (voice/yap, video, socmed, recap) carries a byte-identical synced copy of persona/, so both
# surfaces of the same person read the same voice mapping.
#
# retelldb itself is NOT copied any more: it is installed from a pinned tag, so a surface
# cannot silently run an older memory layer than the one that was reviewed.
#
# run from a surface branch:
#   sh tools/sync-context.sh
# then commit the synced copies like any other change on that branch.

set -e
git fetch origin context
git checkout FETCH_HEAD -- persona requirements.txt
python3 -m pip install -q -r requirements.txt
echo "context synced: persona/ is byte-identical to the context branch, retelldb installed from the pin in requirements.txt."
