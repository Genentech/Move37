# Development environment
FROM ghcr.io/genentech/penrose-lamarck-devcontainer-tools:1.0.0

LABEL version="1.0.0"

# Define build-time arguments
ARG USRID
ARG USRNAME
ARG WORKSPACE=/workspace

# Set environment variables
ENV USRID=${USRID}
ENV USRNAME=${USRNAME}
ENV PATH="/home/$USRNAME/.local/bin:$PATH"

## ------------------------------------------------------------------
## System user (done early so later layers can cache if deps unchanged)
## ------------------------------------------------------------------
RUN useradd --uid $USRID --create-home -s /bin/bash $USRNAME \
    && usermod -aG sudo,docker $USRNAME \
    && echo "$USRNAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

## ------------------------------------------------------------------
## Python runtime & build tooling
##
## ⚠️ ATTENTION ⚠️
##
## - The current layer is very stable, keep it separate from requirements so it rarely rebuilds.
## ------------------------------------------------------------------
RUN apt update \
    && apt install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    build-essential git ninja-build \
    && apt clean \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off

## ------------------------------------------------------------------
## Python dependencies
## 
## ⚠️ ATTENTION ⚠️
##
## - ONLY requirement files are copied at build time to maximize cache hits. The layer is only invalidated when requirements change.
## - The list of requirement files varies with project structure, UPDATE ./python-requirements.txt AND the list below as needed
##
## ------------------------------------------------------------------
COPY python-requirements.txt /tmp/requirements/services.txt
COPY tests/python-requirements.txt /tmp/requirements/tests/python-requirements.txt
COPY src/penroselamarck/python-requirements.txt /tmp/requirements/src/penroselamarck/python-requirements.txt
COPY src/penroselamarck/alembic/python-requirements.txt /tmp/requirements/src/penroselamarck/alembic/python-requirements.txt
COPY src/penroselamarck/api/python-requirements.txt /tmp/requirements/src/penroselamarck/api/python-requirements.txt
COPY src/penroselamarck/core/python-requirements.txt /tmp/requirements/src/penroselamarck/core/python-requirements.txt
COPY src/penroselamarck/db/python-requirements.txt /tmp/requirements/src/penroselamarck/db/python-requirements.txt
COPY src/penroselamarck/mcp/python-requirements.txt /tmp/requirements/src/penroselamarck/mcp/python-requirements.txt
COPY src/penroselamarck/models/python-requirements.txt /tmp/requirements/src/penroselamarck/models/python-requirements.txt
COPY src/penroselamarck/repositories/python-requirements.txt /tmp/requirements/src/penroselamarck/repositories/python-requirements.txt
COPY src/penroselamarck/schemas/python-requirements.txt /tmp/requirements/src/penroselamarck/schemas/python-requirements.txt
COPY src/penroselamarck/services/python-requirements.txt /tmp/requirements/src/penroselamarck/services/python-requirements.txt

RUN set -eux; \
    for f in /tmp/requirements/*.txt; do \
        [ -e "$f" ] || continue; \
        echo "Installing $f"; \
        pip3 install --no-cache-dir -r "$f"; \
    done; \
    rm -rf /root/.cache/pip

## ------------------------------------------------------------------
## Workspace directory (mounted at runtime by devcontainer)
## ------------------------------------------------------------------
RUN mkdir -p ${WORKSPACE} \
    && chown ${USRNAME}:${USRNAME} ${WORKSPACE}

WORKDIR ${WORKSPACE}

USER $USRNAME
