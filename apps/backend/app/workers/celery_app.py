import os
from celery import Celery

# Use Redis as Broker
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "worker",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_soft_time_limit=300, 
    task_time_limit=600,
    # ✅ FIX: Explicitly tell Celery where your task function lives
    imports=["app.workers.ingest_task"]
)