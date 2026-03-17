FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY src/move37/api/python-requirements.txt /tmp/api-requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/api-requirements.txt \
    && npm install --global fern-api@0.75.3

COPY src /workspace/src
COPY fern /workspace/fern

ENV PYTHONPATH=/workspace/src

WORKDIR /workspace/fern

CMD ["sh", "-lc", "python3 scripts/export_openapi.py && HOST=0.0.0.0 fern docs dev --port 3000"]
