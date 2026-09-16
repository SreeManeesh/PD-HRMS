#!/usr/bin/env bash
# setup-hooks.sh — Install local Git pre-commit hook for secret scanning.
#
# Usage (from repo root):
#   bash scripts/setup-hooks.sh
#
# What this does:
#   - Installs a pre-commit hook that runs gitleaks (if available) before every commit
#   - If gitleaks is not installed locally, it warns but does NOT block the commit
#     (CI will catch it anyway)
#
# To install gitleaks: https://github.com/gitleaks/gitleaks#installation

set -e

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_FILE="$HOOKS_DIR/pre-commit"

cat > "$HOOK_FILE" << 'HOOK'
#!/usr/bin/env bash
# Pre-commit hook: scan staged diff for secrets with gitleaks.
# Installed by scripts/setup-hooks.sh

if command -v gitleaks &>/dev/null; then
  echo "🔍 Running gitleaks secret scan on staged changes..."
  gitleaks protect --staged --redact --quiet 2>/dev/null
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ gitleaks detected potential secrets in staged changes."
    echo "   Review the output above, remove the secrets, and try again."
    echo "   If this is a false positive, you can bypass with: git commit --no-verify"
    echo "   (Use --no-verify only when you are certain it's a false positive.)"
    exit 1
  fi
  echo "✅ No secrets detected."
else
  echo "⚠️  gitleaks is not installed — skipping local secret scan."
  echo "   Install gitleaks for local protection: https://github.com/gitleaks/gitleaks"
  echo "   The CI secret-scan workflow will still catch secrets in PRs."
fi
HOOK

chmod +x "$HOOK_FILE"
echo "✅ Pre-commit hook installed at $HOOK_FILE"
echo "   The hook will scan staged changes for secrets before every commit."
