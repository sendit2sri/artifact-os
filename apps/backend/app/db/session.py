import os
from sqlmodel import create_engine, Session

# 1. Get the URL
DATABASE_URL = os.getenv("DATABASE_URL")

# 2. Debugging: Fail fast if missing
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")

# 3. Ensure we use the correct protocol
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

print(f"✅ Connecting to Database: {DATABASE_URL}")

# 4. Create SYNC Engine (Correct for psycopg2)
engine = create_engine(DATABASE_URL, echo=False)

# 5. Dependency for FastAPI
def get_session():
    with Session(engine) as session:
        yield session
