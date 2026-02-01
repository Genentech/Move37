import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# -- Project information -----------------------------------------------------
project = "Penrose-Lamarck"
author = "Roche gRED Computational Sciences"
# Specify version directly in this file. Edit `version_raw` when releasing.
version_raw = "1.0.0"
project_version = f"v{version_raw.lstrip('v')}"
current_year = datetime.now().year
copyright = f"{current_year}, {author} • {project_version}"

# -- General configuration ---------------------------------------------------
extensions = [
    "myst_parser",  # Support existing .md files
    "sphinx_copybutton",  # Copy buttons on code blocks
    "sphinx_design",  # Cards, grids, tabs
    "sphinxcontrib.mermaid",  # Mermaid diagrams
]

# Allow both RST and Markdown sources
source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

# Allow reStructuredText "include" directive
file_insertion_enabled = True

# -- Options for HTML output -------------------------------------------------
html_theme = "furo"
html_title = "Penrose-Lamarck"
html_static_path = ["_static"]
html_css_files = ["custom.css"]
release = project_version
version = project_version
html_favicon = "_static/tab_header_logo.svg"
html_sidebars = {
    "**": [
        "sidebar/brand.html",
        "sidebar/search.html",
        "sidebar/navigation.html",
    ]
}

# Furo theme tweaks
html_theme_options = {
    # Theme-specific logos for light/dark modes (relative to html_static_path)
    "light_logo": "logo-light.svg",
    "dark_logo": "logo-dark.svg",
    "light_css_variables": {
        "color-brand-primary": "#0A84FF",
        "color-brand-content": "#0A84FF",
    },
    "dark_css_variables": {
        # Dark palette closer to OpenAI docs aesthetic
        "color-brand-primary": "#2EAADC",
        "color-brand-content": "#2EAADC",
        "color-background-primary": "#0E0F12",
        "color-background-secondary": "#101217",
        "color-foreground-primary": "#E5E7EB",
        "color-foreground-secondary": "#CBD5E1",
        "color-foreground-muted": "#94A3B8",
    },
    # Hide the project name in the sidebar and rely on the logo
    "sidebar_hide_name": True,
}

DEFAULT_REPO = "genentech/penrose-lamarck"
_repo = DEFAULT_REPO
_branch = "main"
_source_dir = "docs/sphinx/src/"
html_theme_options.update({
    "source_repository": f"https://github.com/{_repo}/",
    "source_branch": _branch,
    "source_directory": _source_dir,
})

# Ensure relative imports work when building
sys.path.insert(0, os.path.abspath("."))

# Provide a substitution usable in any RST file: |version|
rst_epilog = f"\n.. |version| replace:: {project_version}\n"

# Code highlighting styles
pygments_style = "friendly"
pygments_dark_style = "dracula"

# -- Engineering Manifest build hook ----------------------------------------
_MANIFEST_SRC = Path(__file__).parent / "manifest"


def _emit_engineering_manifest(outdir: str) -> None:
    """
    Generate manifest.json from all CEM-*-*.rst files under the manifest folder.

    Writes a single JSON file mapping the file stem (e.g., "CEM-002-000")
    to the full raw content of the corresponding .rst file as one string.

    Output location: <sphinx outdir>/manifest.json

    @param outdir: Sphinx builder output directory (e.g., docs/sphinx/build/html)
    @throws OSError: If the file cannot be written to the output directory
    """
    src_dir = _MANIFEST_SRC
    if not src_dir.exists():
        return

    data: dict[str, str] = {}
    pattern = re.compile(r"^CEM-\d{3}-\d{3}(?:-.+)?$")
    # Consider files matching CEM-###-### optionally followed by a -suffix
    for rst_file in sorted(src_dir.glob("CEM-*-*.rst")):
        if not pattern.match(rst_file.stem):
            continue
        try:
            content = rst_file.read_text(encoding="utf-8")
        except Exception:
            # Skip unreadable files but do not fail the Sphinx build
            continue
        data[rst_file.stem] = content

    out_path = Path(outdir) / "manifest.json"
    # Use pretty printing to aid human inspection; ensure_ascii=False preserves UTF-8
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    out_path.write_text(payload, encoding="utf-8")


def _on_build_finished(app, exception):
    # Only emit on successful builds to avoid stale/partial files
    if exception is None:
        _emit_engineering_manifest(app.outdir)


def setup(app):
    # Hook into Sphinx lifecycle to generate manifest.json alongside HTML output
    app.connect("build-finished", _on_build_finished)
