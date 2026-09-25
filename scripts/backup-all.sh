#!/bin/bash
# Mirror every Papago repo, and the configurator's database, into Dropbox.
#
# Lives in this repo on purpose. It used to sit loose in ~/projects, which
# meant the one script that protects everything was itself protected by
# nothing: if this Mac died, the backups survived in Dropbox and the tool for
# making more did not.
#
# A mirror is a full bare clone: every branch, tag and commit, not a snapshot
# of the working tree. Restore any of them with:
#
#   git clone "<vault>/papagovans-build.git" papagovans-build
#
# Run it after anything worth not losing. It is safe to re-run: existing
# mirrors are fetched rather than recloned.
set -euo pipefail

VAULT="/Volumes/4TB ExtremePro/Dropbox/SumoLab/Clients/Papago Vans/repo-backups"
# Resolved from this script's own location, so it works from any directory and
# keeps working if ~/projects is renamed.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPOS=("$HERE/papagovans-build" "$HERE/papagovans-site" "$HERE/papagovans-web")

if [ ! -d "$VAULT" ]; then
  echo "Vault not mounted: $VAULT" >&2
  echo "Plug in the 4TB ExtremePro drive and run this again." >&2
  exit 1
fi

for repo in "${REPOS[@]}"; do
  [ -d "$repo/.git" ] || { echo "skip (not a repo): $repo"; continue; }
  name=$(basename "$repo")
  dest="$VAULT/$name.git"
  if [ -d "$dest" ]; then
    git -C "$dest" remote update --prune >/dev/null 2>&1
    echo "updated  $name.git"
  else
    git clone --mirror "$repo" "$dest" >/dev/null 2>&1
    echo "mirrored $name.git"
  fi
  # Commit count, not size-pack. size-pack reads 0 until git packs the objects,
  # which looks exactly like a failed backup and is not one.
  commits=$(git -C "$dest" rev-list --all --count)
  head=$(git -C "$dest" log --oneline -1 | cut -c1-46)
  du_h=$(du -sh "$dest" | cut -f1)
  printf "         %s commits, %s on disk\n         head: %s\n" "$commits" "$du_h" "$head"
done

# The catalog lives in Neon, not in git, so it needs its own snapshot.
if [ -d "$HERE/papagovans-build" ]; then
  BACKUP_DIR="$VAULT/database" npm --prefix "$HERE/papagovans-build" run backup 2>&1 | tail -1
fi

echo
echo "Vault: $VAULT"
