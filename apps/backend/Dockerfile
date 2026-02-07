FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Playwright/Postgres
RUN apt-get update && apt-get install -y gcc libpq-dev curl

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install --with-deps chromium

COPY . .
