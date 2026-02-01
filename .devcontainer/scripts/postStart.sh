#!/usr/bin/env bash
set -euo pipefail

echo "[postStart] Starting post-start tasks..."

# Use sudo if available
if command -v sudo > /dev/null 2>&1; then
    SUDO="sudo -E"
else
    SUDO=""
fi

# Docker socket permissions (best-effort; ignore if group/user not present)
echo "[postStart] Adjusting Docker socket permissions (best-effort)..."
$SUDO chown "$USER":docker /var/run/docker.sock || true
$SUDO chmod 660 /var/run/docker.sock || true

echo "[postStart] Re-installing pre-commit hooks to ensure environment is ready..."
python3 -m pre_commit install -f

echo "[postStart] Running pre-commit across all files (non-blocking, show diffs on failure)..."
python3 -m pre_commit run --all-files --show-diff-on-failure || true

echo "[postStart] Completed."
