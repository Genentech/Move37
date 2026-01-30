import os
import sys
from datetime import datetime

# -- Project information -----------------------------------------------------
project = "Penrose-Lamarck"
author = "gRED Computational Sciences"
# Specify version directly in this file. Edit `version_raw` when releasing.
version_raw = "1.0.0"
project_version = f"v{version_raw.lstrip('v')}"
current_year = datetime.now().year
copyright = f"{current_year}, {author} • {project_version}"

# -- General configuration ---------------------------------------------------
extensions = [
    "myst_parser",            # Support existing .md files
    "sphinx_copybutton",     # Copy buttons on code blocks
    "sphinx_design",         # Cards, grids, tabs
    "sphinxcontrib.mermaid", # Mermaid diagrams
]

# Allow both RST and Markdown sources
source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

# -- Options for HTML output -------------------------------------------------
html_theme = "furo"
html_title = f"Penrose-Lamarck"
html_static_path = ["_static"]
html_css_files = ["custom.css"]
release = project_version
version = project_version
html_favicon = "_static/tab_header_logo.svg"

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

# Ensure relative imports work when building
sys.path.insert(0, os.path.abspath("."))

# Provide a substitution usable in any RST file: |version|
rst_epilog = f"\n.. |version| replace:: {project_version}\n"

# Code highlighting styles
pygments_style = "friendly"
pygments_dark_style = "dracula"
