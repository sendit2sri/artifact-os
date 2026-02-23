"""
Pytest configuration. Sets DATABASE_URL for tests when unset so collection succeeds
without requiring .env (e.g. sqlite for local runs; CI can set postgres).
Creates tables when using the default sqlite DB so tests that use the engine can run.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from app.db.session import engine
import app.models  # noqa: F401 - register all tables with SQLModel.metadata
from app.models import SQLModel

SQLModel.metadata.create_all(engine)
