from sqlmodel import Session
from app.models import Job, JobStatus
from datetime import datetime

def update_job_progress(db: Session, job_id: str, step_description: str, step_number: int, total_steps: int = 4):
    """
    Updates the job status in the DB so the UI can poll it.
    """
    job = db.get(Job, job_id)
    if job:
        job.current_step = step_description
        job.steps_completed = step_number
        job.steps_total = total_steps
        if step_number == 0 and job.status == JobStatus.PENDING:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.utcnow()
        db.add(job)
        db.commit()
        print(f"📡 [Job {job_id}] {step_description} ({step_number}/{total_steps})")
