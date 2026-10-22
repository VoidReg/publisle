#!/usr/bin/env bash
set -euo pipefail
# These disposable Linux QA jobs need Ubuntu packages, not Microsoft's feed.
# A 403 from that unrelated feed must not prevent PDF/browser dependencies.
[[ ${GITHUB_ACTIONS:-} == true && -n ${RUNNER_TEMP:-} ]]
[[ -f /etc/apt/sources.list.d/ubuntu.sources ]]
BACKUP="$RUNNER_TEMP/unused-apt-sources"
sudo mkdir -p "$BACKUP"
for source in /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  [[ -f "$source" ]] || continue
  if [[ $(< "$source") == *packages.microsoft.com* ]]; then
    sudo mv "$source" "$BACKUP/"
  fi
done
