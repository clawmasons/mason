#!/usr/bin/env bash
set -euo pipefail

# tag-release.sh
# Run on main after squash-merging a release PR to create the version tag.
# Usage: ./scripts/tag-release.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: Must be on main branch (currently on '${BRANCH}')"
  exit 1
fi

VERSION=$(node -e "console.log(require('./packages/cli/package.json').version)")
TAG="v${VERSION}"

if git rev-parse "$TAG" &>/dev/null; then
  echo "Tag ${TAG} already exists"
  exit 1
fi

git tag "$TAG"
git push origin "$TAG"
echo "==> Tagged and pushed ${TAG}"
