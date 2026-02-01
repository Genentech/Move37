#!/usr/bin/env bash
set -euo pipefail

echo "[postCreate] Starting post-create setup..."

# Python tooling and pre-commit (installation handled in tools image)
echo "[postCreate] Setting up pre-commit hooks..."

echo "[postCreate] Installing pre-commit hooks..."
python3 -m pre_commit install

echo "[postCreate] Running pre-commit across all files (non-blocking)..."
python3 -m pre_commit run --all-files || true

echo "[postCreate] Completed."
