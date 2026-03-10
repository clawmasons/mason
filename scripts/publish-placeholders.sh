#!/usr/bin/env bash
set -euo pipefail

# Publish all placeholder packages under packages/placeholders/
# Each package is published with --access public to support scoped packages.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLACEHOLDERS_DIR="$SCRIPT_DIR/../packages/placeholders"

if [ ! -d "$PLACEHOLDERS_DIR" ]; then
  echo "Error: Placeholders directory not found at $PLACEHOLDERS_DIR"
  exit 1
fi

published=0
failed=0

for dir in "$PLACEHOLDERS_DIR"/*/; do
  if [ ! -f "$dir/package.json" ]; then
    echo "Skipping $dir — no package.json"
    continue
  fi

  name=$(node -e "console.log(require('$dir/package.json').name)")
  echo "Publishing $name from $dir ..."

  if (cd "$dir" && npm publish --access public); then
    echo "  Published $name successfully."
    ((published++))
  else
    echo "  Failed to publish $name (may already exist)."
    ((failed++))
  fi
done

echo ""
echo "Done. Published: $published, Failed: $failed"
