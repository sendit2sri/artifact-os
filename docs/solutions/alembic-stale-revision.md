# Fix: Can't locate revision (stale alembic_version)

## Symptom
```
ERROR [alembic.util.messaging] Can't locate revision identified by 'o9p0q1r2s3t'
FAILED: Can't locate revision identified by 'o9p0q1r2s3t'
```

The database's `alembic_version` table has a revision ID that no longer exists in the repo (migration removed or from another branch).

## Fix (dev DB, disposable)

Stamp the DB to the current head so Alembic stops referencing the missing revision:

```bash
docker compose up -d db
docker compose exec backend bash -c "cd /app && alembic stamp head"
docker compose exec backend bash -c "cd /app && alembic upgrade head"
```

**Note:** `alembic stamp head` only updates the `alembic_version` table; it does not run migrations. If your schema is not actually at head, you may need to drop and recreate the DB, then run `alembic upgrade head` from a clean state.

## Clean slate (drop DB and re-run all migrations)

```bash
docker compose down -v   # removes volumes including DB data
docker compose up -d db
docker compose exec backend bash -c "cd /app && alembic upgrade head"
```
