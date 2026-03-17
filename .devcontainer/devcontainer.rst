Devcontainer
============

This devcontainer mirrors the multi-stage setup used in ``penrose-lamarck`` and
is adapted for the ``mv37`` stack:

- Docker and Docker Compose for working with the local stack
- Python tooling for the FastAPI, Alembic, and database packages
- Node.js for the web app and SDK packages

Open the repository in VS Code and use ``Dev Containers: Reopen in Container``
after building the image set with ``.devcontainer/init.sh``.
