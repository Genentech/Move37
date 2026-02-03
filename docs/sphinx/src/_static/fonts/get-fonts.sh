#!/usr/bin/env bash
# usage: ./docs/sphinx/src/_static/fonts/get-fonts.sh
set -euo pipefail

# Fetch local variable font files for docs styling using GitHub Releases.
# We vendor variable TTFs (widely supported) for deterministic, offline-friendly builds.
# - Inter v4.1: InterVariable.ttf, InterVariable-Italic.ttf
# - JetBrains Mono v2.304: JetBrainsMono[wght].ttf, JetBrainsMono-Italic[wght].ttf

FONT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$FONT_DIR"

# Versions can be pinned here when needed
INTER_VERSION="v4.1"
JETBRAINS_VERSION="v2.304"

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

echo "Downloading Inter ${INTER_VERSION} release zip..."
curl -fsSL -o "$tmpdir/inter.zip" "https://github.com/rsms/inter/releases/download/${INTER_VERSION}/Inter-4.1.zip"

echo "Extracting Inter variable TTFs..."
# Inter ships variable TTFs at the root of the zip
unzip -p "$tmpdir/inter.zip" InterVariable.ttf > "$FONT_DIR/InterVariable.ttf"
unzip -p "$tmpdir/inter.zip" InterVariable-Italic.ttf > "$FONT_DIR/InterVariable-Italic.ttf"

echo "Downloading JetBrains Mono ${JETBRAINS_VERSION} release zip..."
curl -fsSL -o "$tmpdir/jb.zip" "https://github.com/JetBrains/JetBrainsMono/releases/download/${JETBRAINS_VERSION}/JetBrainsMono-2.304.zip"

echo "Extracting JetBrains Mono variable TTFs..."
# JetBrains Mono ships variable TTFs under fonts/variable/ with literal [wght] in filenames
jb_normal_path="$(unzip -Z -1 "$tmpdir/jb.zip" | grep -E '^fonts/variable/JetBrainsMono.*\[wght\]\.ttf$' | head -n1 || true)"
jb_italic_path="$(unzip -Z -1 "$tmpdir/jb.zip" | grep -E '^fonts/variable/JetBrainsMono-Italic.*\[wght\]\.ttf$' | head -n1 || true)"
if [[ -z "$jb_normal_path" || -z "$jb_italic_path" ]]; then
    echo "Failed to locate JetBrains Mono variable TTFs in release zip" >&2
    exit 11
fi
# Escape literal [ and ] for unzip's pattern matcher
jb_normal_esc="${jb_normal_path//[/\\[}"
jb_normal_esc="${jb_normal_esc//]/\\]}"
jb_italic_esc="${jb_italic_path//[/\\[}"
jb_italic_esc="${jb_italic_esc//]/\\]}"

unzip -p "$tmpdir/jb.zip" "$jb_normal_esc" > "$FONT_DIR/JetBrainsMono-Variable.ttf"
unzip -p "$tmpdir/jb.zip" "$jb_italic_esc" > "$FONT_DIR/JetBrainsMono-Variable-Italic.ttf"

echo "Done. Available font files:"
find "$FONT_DIR" -lh | sed 's/^/  /'
echo "Fonts downloaded to: $FONT_DIR"
