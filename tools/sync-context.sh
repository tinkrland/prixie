#!/bin/sh
# pull the persona context from the context branch into a surface branch.
# the context branch owns retelldb/ and persona/; every surface branch
# (voice, video, socmed, recap) carries a byte-identical synced copy, so both surfaces of the
# same person read the same memories and the same voice mapping.
#
# run from a surface branch:
#   sh tools/sync-context.sh
# then commit the synced copies like any other change on that branch.

set -e
git fetch origin context
git checkout FETCH_HEAD -- retelldb persona
echo "context synced: retelldb/ and persona/ are byte-identical to the context branch."
echo "commit them on this branch so the surface branch tracks the sync."
