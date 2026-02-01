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
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    build-essential git ninja-build \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir --upgrade \
    pip==24.2 \
    setuptools==70.0.0 \
    wheel==0.43.0

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off

## ------------------------------------------------------------------
## Python dependencies (single aggregator file)
##
## - ONLY the aggregator file is copied to maximize cache hits.
## ------------------------------------------------------------------
COPY .devcontainer/python-requirements.txt /tmp/requirements/devcontainer-python-requirements.txt

# Copy all requirement files referenced by the aggregator to preserve cache
COPY python-requirements.txt /tmp/python-requirements.txt
COPY tests/python-requirements.txt /tmp/tests/python-requirements.txt
COPY src/penroselamarck/python-requirements.txt /tmp/src/penroselamarck/python-requirements.txt
COPY src/penroselamarck/alembic/python-requirements.txt /tmp/src/penroselamarck/alembic/python-requirements.txt
COPY src/penroselamarck/api/python-requirements.txt /tmp/src/penroselamarck/api/python-requirements.txt
COPY src/penroselamarck/core/python-requirements.txt /tmp/src/penroselamarck/core/python-requirements.txt
COPY src/penroselamarck/db/python-requirements.txt /tmp/src/penroselamarck/db/python-requirements.txt
COPY src/penroselamarck/mcp/python-requirements.txt /tmp/src/penroselamarck/mcp/python-requirements.txt
COPY src/penroselamarck/models/python-requirements.txt /tmp/src/penroselamarck/models/python-requirements.txt
COPY src/penroselamarck/repositories/python-requirements.txt /tmp/src/penroselamarck/repositories/python-requirements.txt
COPY src/penroselamarck/schemas/python-requirements.txt /tmp/src/penroselamarck/schemas/python-requirements.txt
COPY src/penroselamarck/services/python-requirements.txt /tmp/src/penroselamarck/services/python-requirements.txt

RUN set -eux; \
    pip3 install --no-cache-dir -r /tmp/requirements/devcontainer-python-requirements.txt; \
    rm -rf /root/.cache/pip

## ------------------------------------------------------------------
## Workspace directory (mounted at runtime by devcontainer)
## ------------------------------------------------------------------
RUN mkdir -p ${WORKSPACE} \
    && chown ${USRNAME}:${USRNAME} ${WORKSPACE}

WORKDIR ${WORKSPACE}

USER $USRNAME
