#!/usr/bin/env bash
set -euo pipefail

echo "[postCreate] Starting post-create setup..."

# Codex CLI (prefer system install via sudo; fallback to user-local prefix)
if command -v npm > /dev/null 2>&1; then
    echo "[postCreate] Installing OpenAI Codex CLI..."
    if command -v sudo > /dev/null 2>&1; then
        sudo -n npm uninstall -g codex > /dev/null 2>&1 || true
        if ! sudo -n npm install -g @openai/codex@latest; then
            echo "[postCreate] sudo install failed; falling back to user-local npm prefix."
            npm uninstall -g --prefix "${HOME}/.local" codex > /dev/null 2>&1 || true
            npm install -g --prefix "${HOME}/.local" @openai/codex@latest
        fi
    else
        npm uninstall -g --prefix "${HOME}/.local" codex > /dev/null 2>&1 || true
        npm install -g --prefix "${HOME}/.local" @openai/codex@latest
    fi
    hash -r || true
    if command -v codex > /dev/null 2>&1; then
        CODEX_VERSION="$(codex --version 2> /dev/null || true)"
        echo "[postCreate] codex path: $(command -v codex)"
        echo "[postCreate] codex version: ${CODEX_VERSION}"
        if [[ "${CODEX_VERSION}" != codex-cli* ]]; then
            echo "[postCreate] warning: codex binary does not look like OpenAI Codex CLI."
        fi
    fi
else
    echo "[postCreate] npm not found; skipping Codex CLI installation."
fi

if [ -f "src/move37/web/package.json" ]; then
    echo "[postCreate] Installing web dependencies..."
    (
        cd src/move37/web
        npm install
    )
fi

if [ -f ".pre-commit-config.yaml" ]; then
    echo "[postCreate] Installing pre-commit hooks..."
    python3 -m pre_commit install

    echo "[postCreate] Running pre-commit across all files (non-blocking)..."
    python3 -m pre_commit run --all-files || true
else
    echo "[postCreate] No .pre-commit-config.yaml found; skipping pre-commit setup."
fi

echo "[postCreate] Completed."
