FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Playwright/Postgres (minimal, no bloat)
RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libpq-dev curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright browsers: only for worker (content extraction). Backend API does not need them.
ARG INSTALL_PLAYWRIGHT=false
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN if [ "$INSTALL_PLAYWRIGHT" = "true" ]; then playwright install --with-deps chromium; fi

COPY . .
