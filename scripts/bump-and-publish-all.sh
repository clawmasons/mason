#!/usr/bin/env bash
set -euo pipefail

# bump-and-publish-all.sh
# One-command patch bump + publish for all @clawmasons packages.
# Usage: ./scripts/bump-and-publish-all.sh [--dry-run]

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "==> DRY RUN MODE (will skip publish + push)"
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Preflight ────────────────────────────────────────────────────────────────

# Clean git tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# npm auth
if ! npm whoami &>/dev/null; then
  echo "ERROR: Not logged in to npm. Run 'npm login' first."
  exit 1
fi

echo "==> Preflight OK (clean tree, npm authenticated as $(npm whoami))"

# ── All publishable packages ─────────────────────────────────────────────────

PACKAGES=(
  "@clawmasons/shared"
  "@clawmasons/agent-sdk"
  "@clawmasons/proxy"
  "@clawmasons/mcp-agent"
  "@clawmasons/agent-entry"
  "@clawmasons/mason"
)

# ── Create changeset ─────────────────────────────────────────────────────────

CHANGESET_ID="bump-all-$(date +%s)"
CHANGESET_FILE=".changeset/${CHANGESET_ID}.md"

{
  echo "---"
  for pkg in "${PACKAGES[@]}"; do
    echo "\"${pkg}\": patch"
  done
  echo "---"
  echo ""
  echo "Patch bump all packages"
} > "$CHANGESET_FILE"

echo "==> Created changeset: ${CHANGESET_FILE}"

# ── Version bump ──────────────────────────────────────────────────────────────

npx changeset version
echo "==> Versions bumped"

# Read new version from shared (they're all the same in fixed mode)
NEW_VERSION=$(node -e "console.log(require('./packages/shared/package.json').version)")
echo "==> New version: ${NEW_VERSION}"

# ── Build ─────────────────────────────────────────────────────────────────────

npm run clean
npm run build
echo "==> Build complete"


# ── Commit ────────────────────────────────────────────────────────────────────

git add -A
git commit -m "v${NEW_VERSION}"
echo "==> Committed v${NEW_VERSION}"

# ── Publish + Push ────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == true ]]; then
  echo "==> DRY RUN: skipping publish and push"
  echo "==> To undo: git reset --soft HEAD~1 && git restore --staged ."
  exit 0
fi


npx changeset publish --no-git-tag
echo "==> Published to npm"

git push origin HEAD
echo "==> Pushed to remote"

echo "==> Done! All packages published at v${NEW_VERSION}"
echo "==> After squash-merging to main, run: ./scripts/tag-release.sh"
