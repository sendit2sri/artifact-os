"""ID coercion helpers for UUID columns (worker/API boundaries)."""
import uuid
from uuid import UUID


def as_uuid(x: str | UUID | None) -> UUID:
    """Convert str or UUID to UUID. Use at worker/API entrypoints."""
    if x is None:
        raise ValueError("Expected UUID, got None")
    if isinstance(x, str) and not x.strip():
        raise ValueError("Expected UUID, got empty string")
    return x if isinstance(x, UUID) else uuid.UUID(x)
