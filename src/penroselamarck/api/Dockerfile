FROM python:3.11-slim

WORKDIR /app

COPY src/penroselamarck/api/python-requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy source tree from project root
COPY src /app/src

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

EXPOSE 8080
CMD ["uvicorn", "penroselamarck.api.server:app", "--host", "0.0.0.0", "--port", "8080"]
