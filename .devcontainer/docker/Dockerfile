# Development environment
FROM move37-devcontainer-tools:1.0.0

LABEL version="1.0.0"

# Define build-time arguments
ARG USRID
ARG USRNAME

# Set environment variables
ENV USRID=${USRID}
ENV USRNAME=${USRNAME}
ENV WORKSPACE="/home/$USRNAME"
ENV PATH="/home/$USRNAME/.local/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=on
ENV PIP_NO_CACHE_DIR=off
ENV PYTHONPATH="/home/$USRNAME/src:/home/$USRNAME"

## ------------------------------------------------------------------
## System user
## ------------------------------------------------------------------
RUN useradd --uid $USRID --create-home -s /bin/bash $USRNAME \
    && usermod -aG sudo,docker $USRNAME \
    && echo "$USRNAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

## ------------------------------------------------------------------
## Python runtime & build tooling
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

## ------------------------------------------------------------------
## Python dependencies
## ------------------------------------------------------------------
COPY .devcontainer/python-requirements.txt /tmp/requirements/devcontainer-python-requirements.txt
COPY src/move37/api/python-requirements.txt /tmp/src/move37/api/python-requirements.txt
COPY src/move37/alembic/python-requirements.txt /tmp/src/move37/alembic/python-requirements.txt
COPY src/move37/db/python-requirements.txt /tmp/src/move37/db/python-requirements.txt

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
