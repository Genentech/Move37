# Sphinx live docs server
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /docs

# System deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
  && rm -rf /var/lib/apt/lists/*

# Python deps
COPY docs/sphinx/requirements.txt /docs/requirements.txt
RUN pip install --no-cache-dir -r /docs/requirements.txt

# Expose live server port
EXPOSE 8000

# Default command runs sphinx-autobuild
CMD ["sphinx-autobuild", "/docs/src", "/docs/build/html", "--host", "0.0.0.0", "--port", "8000"]
