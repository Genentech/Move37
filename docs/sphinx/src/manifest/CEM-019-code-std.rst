Coding Standards
================

Linting and Formatting
----------------------

- Python: Use `Ruff <https://docs.astral.sh/ruff/>`_ for linting and formatting.

  - Line length: 100 characters.
  - Target Python: 3.10.
  - Exclude generated documentation (``docs/sphinx/build``) and Alembic versions (``src/penroselamarck/alembic/versions``).

- Shell scripts: Use ``shellcheck`` for linting and ``shfmt`` for formatting with flags ``-i 4 -sr``.

- Dockerfiles: Use ``hadolint`` for linting.

- Pre-commit: Configure hooks for ``ruff``, ``ruff-format``, ``shellcheck``, ``shfmt``, and ``hadolint``.
  Run hooks locally and enforce in CI via the GitHub ``pre-commit/action`` on pushes and pull requests.

- Devcontainer: Automatically install and run ``pre-commit`` during container creation and on start
  (``postCreateCommand`` and ``postStartCommand``) so hooks are installed and validated by default.

- Editors: Enable format-on-save. Recommend VS Code extensions: Ruff, Python, Pylance, ShellCheck, Shell Format, Hadolint, Docker, GitHub Actions.
