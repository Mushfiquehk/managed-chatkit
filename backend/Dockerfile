FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

# Copy backend source
COPY backend /app/backend

# Install build requirements then install the package in editable mode
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && python -m pip install --upgrade pip setuptools wheel \
  && pip install --no-cache-dir -e /app/backend

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
