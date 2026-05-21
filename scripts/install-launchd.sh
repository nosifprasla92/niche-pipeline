#!/usr/bin/env bash
# Install or reinstall the niche-pipeline worker as a launchd LaunchAgent.
# Idempotent — safe to run repeatedly. Stops the existing agent (if any)
# before reloading.
set -euo pipefail

REPO_PATH="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.niche-pipeline.worker"
TEMPLATE="$REPO_PATH/launchd/$LABEL.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET="$TARGET_DIR/$LABEL.plist"

# Resolve pnpm absolute path. launchd doesn't inherit your shell PATH.
if ! PNPM_PATH="$(command -v pnpm)"; then
    echo "error: pnpm not found in PATH" >&2
    exit 1
fi

# Make sure the log dir exists
mkdir -p "$HOME/Library/Logs"
mkdir -p "$TARGET_DIR"

# Substitute and write
sed \
    -e "s|{{REPO_PATH}}|$REPO_PATH|g" \
    -e "s|{{PNPM_PATH}}|$PNPM_PATH|g" \
    -e "s|{{HOME}}|$HOME|g" \
    -e "s|{{PATH}}|$PATH|g" \
    "$TEMPLATE" > "$TARGET"

echo "wrote $TARGET"

# Stop existing instance, then bootstrap fresh.
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    echo "stopping existing agent…"
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
fi

echo "loading agent…"
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo
echo "✓ worker installed."
echo
echo "Status:"
echo "  launchctl print $DOMAIN/$LABEL | head -20"
echo
echo "Logs:"
echo "  tail -f ~/Library/Logs/niche-pipeline-worker.out.log"
echo "  tail -f ~/Library/Logs/niche-pipeline-worker.err.log"
echo
echo "Stop:"
echo "  launchctl bootout $DOMAIN/$LABEL"
