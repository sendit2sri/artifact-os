import uuid
import hashlib
import traceback
from typing import Dict, Optional, Tuple
from sqlmodel import Session, select
from app.db.session import engine
from app.utils.ids import as_uuid
from app.workers.celery_app import celery_app
from app.models import Job, JobStatus, SourceDoc, ResearchNode, IntegrityStatus, ReviewStatus, SourceType, NodeType
from app.services.llm import extract_facts_from_markdown
from app.extractors import detect_source_type, normalize_url, extract
import requests
from bs4 import BeautifulSoup
import bleach
import re

# Safe HTML tags and attributes for sanitization
ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre', 'hr', 'div', 'span',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img', 'figure', 'figcaption'
]

ALLOWED_ATTRIBUTES = {
    '*': ['class', 'id'],
    'a': ['href', 'title', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'code': ['class'],
    'pre': ['class'],
}

def sanitize_html(html: Optional[str]) -> Optional[str]:
    """
    Sanitize HTML content to prevent XSS attacks.
    Allows safe tags and attributes only.
    """
    if not html:
        return None
    
    try:
        cleaned = bleach.clean(
            html,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRIBUTES,
            strip=True
        )
        return cleaned
    except Exception as e:
        print(f"⚠️ HTML sanitization failed: {e}")
        return None

def find_quote_offsets(content: Optional[str], quote: str) -> Tuple[Optional[int], Optional[int]]:
    """
    Find character offsets for a quote in content.
    Returns (start, end) or (None, None) if not found.
    """
    if not content or not quote:
        return (None, None)
    
    # Try exact match (case-insensitive)
    lower_content = content.lower()
    lower_quote = quote.lower()
    
    start = lower_content.find(lower_quote)
    if start != -1:
        return (start, start + len(quote))
    
    # Try normalized whitespace match
    def normalize(s: str) -> str:
        return " ".join(s.split())

    norm_content = normalize(lower_content)
    norm_quote = normalize(lower_quote)
    
    start = norm_content.find(norm_quote)
    if start != -1:
        # Approximate mapping back to original
        # This is a best-effort - may be off by a few chars
        return (start, start + len(quote))
    
    return (None, None)

def clean_main_content(html_content: str, url: str) -> Dict[str, Optional[str]]:
    """
    Extract multiple content representations from HTML for better Reader view rendering.
    
    Returns:
        dict with keys: text_raw, markdown, html_clean
    """
    result = {
        "text_raw": None,
        "markdown": None,
        "html_clean": None
    }
    
    try:
        # Try using trafilatura first (better at extracting main content)
        try:
            import trafilatura
            
            # Extract with full options to get both text and markdown
            extracted = trafilatura.extract(
                html_content,
                output_format="json",
                include_comments=False,
                include_tables=True,
                no_fallback=False
            )
            
            if extracted:
                import json
                data = json.loads(extracted) if isinstance(extracted, str) else extracted
                
                # Get raw text
                result["text_raw"] = data.get("text", "")
                
                # Try to get markdown representation
                markdown_content = trafilatura.extract(
                    html_content,
                    output_format="markdown",
                    include_comments=False,
                    include_tables=True,
                    no_fallback=False
                )
                if markdown_content:
                    result["markdown"] = markdown_content
                    
        except ImportError:
            print("⚠️ trafilatura not installed, falling back to BeautifulSoup")
        except Exception as e:
            print(f"⚠️ trafilatura extraction failed: {e}")
    
        # Fallback: Use BeautifulSoup for basic extraction
        if not result["text_raw"]:
            soup = BeautifulSoup(html_content, "html.parser")
            
            # Remove unwanted elements
            for element in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
                element.decompose()
            
            # Try to find main content area
            main_content = None
            for selector in ["main", "article", '[role="main"]', ".main-content", "#content", ".content"]:
                main_content = soup.select_one(selector)
                if main_content:
                    break
            
            # Use main content if found, otherwise use body
            content_area = main_content if main_content else soup.body
            
            if content_area:
                # Get clean HTML and sanitize it
                raw_html = str(content_area)
                result["html_clean"] = sanitize_html(raw_html)
                
                # Get text
                text_content = content_area.get_text(separator="\n").strip()
                text_content = re.sub(r'\n{3,}', '\n\n', text_content)
                text_content = re.sub(r' {2,}', ' ', text_content)
                result["text_raw"] = text_content
        
        # Ensure we have at least text_raw
        if not result["text_raw"]:
            soup = BeautifulSoup(html_content, "html.parser")
            result["text_raw"] = soup.get_text(separator="\n").strip()
            
    except Exception as e:
        print(f"⚠️ Content extraction failed: {e}")
        # Last resort: plain text extraction
        soup = BeautifulSoup(html_content, "html.parser")
        result["text_raw"] = soup.get_text(separator="\n").strip()
    
    return result

@celery_app.task(
    bind=True,
    name="ingest_url",  
    soft_time_limit=300,
    time_limit=600
)
def _resolve_fact_source_url(section_context: Optional[str], source_type: SourceType, metadata: Optional[dict], doc_url: str) -> tuple:
    """Return (section_context, source_url) for Reddit/YouTube facts."""
    if not metadata:
        return (section_context, None)
    ctx = (section_context or "").strip()
    # Reddit: [OP] or "OP" -> reddit:op; [Comment: id] or comment id -> reddit:comment:id + permalink
    if source_type == SourceType.REDDIT:
        if "[OP]" in ctx or (ctx.upper() == "OP") or ctx == "reddit:op":
            return ("reddit:op", metadata.get("thread_url") or doc_url)
        import re
        m = re.search(r"\[Comment:\s*([^\]]+)\]|comment[:\s]+([a-z0-9]+)", ctx, re.I)
        if m:
            cid = (m.group(1) or m.group(2) or "").strip()
            if cid:
                for c in metadata.get("comments", []):
                    if c.get("id") == cid:
                        return (f"reddit:comment:{cid}", c.get("permalink") or doc_url)
                return (f"reddit:comment:{cid}", doc_url)
        if ctx.startswith("reddit:comment:"):
            cid = ctx.replace("reddit:comment:", "").strip()
            for c in metadata.get("comments", []):
                if c.get("id") == cid:
                    return (ctx, c.get("permalink") or doc_url)
            return (ctx, doc_url)
    # YouTube: [start-end] or yt:start-end -> source_url = video_url
    if source_type == SourceType.YOUTUBE:
        m = re.search(r"\[?(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\]?|yt:(\d+\.?\d*)-(\d+\.?\d*)", ctx)
        if m:
            g = m.groups()
            s, e = (g[0], g[1]) if g[0] and g[1] else (g[2], g[3])
            if s and e:
                return (f"yt:{s}-{e}", metadata.get("video_url") or doc_url)
        if ctx.startswith("yt:"):
            return (ctx, metadata.get("video_url") or doc_url)
    # Media (uploaded audio/video): [start-end] -> doc_url (media://...)
    if source_type == SourceType.MEDIA:
        m = re.search(r"\[?(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\]?", ctx)
        if m and m.group(1) and m.group(2):
            return (f"yt:{m.group(1)}-{m.group(2)}", doc_url)
    return (section_context, None)


# Standardized steps for timeline UI
JOB_STEP_QUEUED = "QUEUED"
JOB_STEP_FETCHING = "FETCHING"
JOB_STEP_EXTRACTING = "EXTRACTING"
JOB_STEP_FACTING = "FACTING"
JOB_STEP_DONE = "DONE"
JOB_STEP_FAILED = "FAILED"

ERROR_CODES = ("NETWORK", "RATE_LIMIT", "PAYWALL", "UNSUPPORTED", "EMPTY_CONTENT", "TRANSCRIPT_DISABLED", "TRANSCRIPT_FAILED")

def _set_job_failed(job, error_code: str, error_message: str, result_summary: Optional[dict] = None):
    job.status = JobStatus.FAILED
    job.current_step = JOB_STEP_FAILED
    job.result_summary = dict(result_summary or {})
    job.result_summary["error_code"] = error_code
    job.result_summary["error_message"] = error_message


def ingest_url_task(self, job_id: str | uuid.UUID, url: str) -> None:
    job_id = as_uuid(job_id)
    with Session(engine) as db:
        job = db.get(Job, job_id)
        if not job:
            return
        params = job.params or {}
        source_type = SourceType(params.get("source_type", "WEB")) if params.get("source_type") else detect_source_type(url)
        canonical_url = params.get("canonical_url") or normalize_url(url, source_type)
        e2e_retry_ok = params.get("e2e_retry_ok") is True

        try:
            # Graceful deduplication: check for existing SourceDoc before any network call
            existing_doc = db.exec(
                select(SourceDoc).where(SourceDoc.project_id == job.project_id, SourceDoc.url == url)
            ).first()
            if not existing_doc and canonical_url:
                existing_doc = db.exec(
                    select(SourceDoc).where(
                        SourceDoc.project_id == job.project_id,
                        SourceDoc.canonical_url == canonical_url
                    )
                ).first()
            if existing_doc:
                job.status = JobStatus.COMPLETED
                job.current_step = JOB_STEP_DONE
                job.steps_completed = 5
                job.result_summary = {
                    "is_duplicate": True,
                    "source_id": str(existing_doc.id),
                    "source_title": existing_doc.title or canonical_url or url,
                    "source_type": source_type.value,
                }
                db.add(job)
                db.commit()
                return

            job.current_step = JOB_STEP_QUEUED
            job.status = JobStatus.RUNNING
            db.add(job)
            db.commit()

            # E2E retry stub: succeed with minimal SourceDoc + 1 fact
            if e2e_retry_ok:
                job.current_step = JOB_STEP_FETCHING
                db.add(job)
                db.commit()
                store_url = canonical_url or url
                domain = store_url.split("//")[-1].split("/")[0] if "//" in store_url else url
                source_doc = SourceDoc(
                    id=uuid.uuid4(),
                    project_id=job.project_id,
                    workspace_id=job.workspace_id,
                    url=store_url,
                    domain=domain,
                    title="E2E Retry Stub",
                    source_type=source_type,
                    canonical_url=canonical_url,
                    content_text="Stub content for retry.",
                    content_text_raw="Stub content for retry.",
                    content_hash=hashlib.md5(b"stub").hexdigest(),
                )
                db.add(source_doc)
                db.commit()
                db.refresh(source_doc)
                fact = ResearchNode(
                    id=uuid.uuid4(),
                    project_id=job.project_id,
                    source_doc_id=source_doc.id,
                    type=NodeType.FACT,
                    fact_text="Stub fact from retry.",
                    confidence_score=80,
                    integrity_status=IntegrityStatus.VERIFIED,
                    review_status=ReviewStatus.PENDING,
                )
                db.add(fact)
                job.status = JobStatus.COMPLETED
                job.current_step = JOB_STEP_DONE
                job.steps_completed = 5
                job.result_summary = {"source_title": "E2E Retry Stub", "source_type": source_type.value, "facts_count": 1}
                db.add(job)
                db.commit()
                return

            text_content = ""
            content_formats = {"text_raw": None, "markdown": None, "html_clean": None}
            page_title = url
            metadata_json = None
            
            if source_type == SourceType.WEB:
                job.current_step = JOB_STEP_FETCHING
                db.add(job)
                db.commit()
                headers = {"User-Agent": "Mozilla/5.0 (ArtifactOS Research Bot)"}
                resp = requests.get(url, headers=headers, timeout=15)
                resp.raise_for_status()
                job.current_step = JOB_STEP_EXTRACTING
                db.add(job)
                db.commit()
                extracted = extract(url, source_type, resp.text)
                content_formats["text_raw"] = extracted.get("text_raw")
                content_formats["markdown"] = extracted.get("markdown")
                content_formats["html_clean"] = extracted.get("html_clean")
                text_content = content_formats["text_raw"] or ""
                soup = BeautifulSoup(resp.text, "html.parser")
                page_title = extracted.get("title") or (soup.title.string if soup.title else url)
            else:
                job.current_step = JOB_STEP_EXTRACTING
                db.add(job)
                db.commit()
                extracted = extract(url, source_type)
                if source_type == SourceType.REDDIT:
                    page_title = extracted.get("title", "")
                    op_text = extracted.get("op_text", "")
                    comments = extracted.get("comments", [])[:20]
                    parts = [f"## [OP]\n{op_text}"]
                    metadata_json = {"thread_url": extracted.get("thread_url", url), "comments": [{"id": c.get("id"), "permalink": c.get("permalink"), "author": c.get("author"), "score": c.get("score")} for c in comments]}
                    for c in comments:
                        parts.append(f"## [Comment: {c.get('id', '')}]\n{c.get('body', '')}")
                    text_content = "\n\n".join(parts)
                    content_formats["text_raw"] = text_content
                elif source_type == SourceType.YOUTUBE:
                    page_title = extracted.get("title", "") or "YouTube video"
                    transcript = extracted.get("transcript", [])
                    if not transcript:
                        _set_job_failed(
                            job,
                            "TRANSCRIPT_DISABLED",
                            "Captions not available — upload audio file",
                            {"source_title": page_title, "source_type": source_type.value},
                        )
                        db.add(job)
                        db.commit()
                        return
                    parts = []
                    metadata_json = {"video_url": extracted.get("video_url", url), "transcript": [{"start_s": s.get("start_s"), "end_s": s.get("end_s")} for s in transcript]}
                    for seg in transcript:
                        parts.append(f"## [{seg.get('start_s', 0)}-{seg.get('end_s', 0)}]\n{seg.get('text', '')}")
                    text_content = "\n\n".join(parts) if parts else extracted.get("title", "")
                    content_formats["text_raw"] = text_content
            
            if not (text_content or "").strip():
                _set_job_failed(job, "EMPTY_CONTENT", "No content could be extracted from this page.")
                db.add(job)
                db.commit()
                return

            content_hash = hashlib.md5((text_content or "").encode("utf-8")).hexdigest()
            
            job.current_step = JOB_STEP_EXTRACTING
            db.add(job)
            db.commit()
            
            domain = url.split("//")[-1].split("/")[0] if "//" in url else url
            existing_doc = db.exec(
                select(SourceDoc).where(SourceDoc.project_id == job.project_id, SourceDoc.url == url)
            ).first()
            if not existing_doc and canonical_url:
                existing_doc = db.exec(
                    select(SourceDoc).where(SourceDoc.project_id == job.project_id, SourceDoc.canonical_url == canonical_url)
                ).first()
            
            if existing_doc:
                source_doc = existing_doc
                source_doc.title = page_title
                source_doc.content_text = text_content
                source_doc.content_text_raw = content_formats["text_raw"]
                source_doc.content_markdown = content_formats["markdown"]
                source_doc.content_html_clean = content_formats["html_clean"]
                source_doc.content_hash = content_hash
                source_doc.source_type = source_type
                source_doc.canonical_url = canonical_url or source_doc.canonical_url
                if metadata_json is not None:
                    source_doc.metadata_json = metadata_json
            else:
                store_url = canonical_url or url
                store_domain = store_url.split("//")[-1].split("/")[0] if "//" in store_url else domain
                source_doc = SourceDoc(
                    id=uuid.uuid4(),
                    project_id=job.project_id,
                    workspace_id=job.workspace_id,
                    url=store_url,
                    domain=store_domain,
                    title=page_title,
                    source_type=source_type,
                    canonical_url=canonical_url,
                    metadata_json=metadata_json,
                    content_text=text_content,
                    content_text_raw=content_formats["text_raw"],
                    content_markdown=content_formats["markdown"],
                    content_html_clean=content_formats["html_clean"],
                    content_s3_path="",
                    content_hash=content_hash,
                )
                db.add(source_doc)
            
            db.commit()
            db.refresh(source_doc)
            
            job.current_step = JOB_STEP_FACTING
            job.steps_completed = 3
            db.add(job)
            db.commit()
            
            extraction_result = extract_facts_from_markdown((text_content or "")[:25000])
            
            job.current_step = JOB_STEP_FACTING
            job.steps_completed = 4
            db.add(job)
            db.commit()
            
            saved_count = 0
            auto_flagged_count = 0
            for fact_data in extraction_result.facts:
                try:
                    confidence_score = 85 if fact_data.confidence == "HIGH" else (60 if fact_data.confidence == "MEDIUM" else 40)
                    review_status = ReviewStatus.PENDING if confidence_score >= 75 else ReviewStatus.NEEDS_REVIEW
                    if review_status == ReviewStatus.NEEDS_REVIEW:
                        auto_flagged_count += 1
                    quote = fact_data.quote_span
                    start_raw, end_raw = find_quote_offsets(content_formats["text_raw"], quote)
                    start_md, end_md = find_quote_offsets(content_formats.get("markdown"), quote)
                    evidence_snippet = quote[:500] if quote and len(quote) > 10 else None
                    if evidence_snippet and len(quote or "") > 500:
                        evidence_snippet = quote[:500]
                    sect_ctx, fact_source_url = _resolve_fact_source_url(
                        fact_data.section_context, source_type, metadata_json, url
                    )
                    fact = ResearchNode(
                        id=uuid.uuid4(),
                        project_id=job.project_id,
                        source_doc_id=source_doc.id,
                        fact_text=fact_data.fact_text,
                        is_key_claim=fact_data.is_key_claim,
                        confidence_score=confidence_score,
                        section_context=sect_ctx or fact_data.section_context,
                        source_url=fact_source_url,
                        quote_text_raw=quote,
                        evidence_snippet=evidence_snippet,
                        evidence_start_char_raw=start_raw,
                        evidence_end_char_raw=end_raw,
                        evidence_start_char_md=start_md,
                        evidence_end_char_md=end_md,
                        tags=fact_data.tags or [],
                        review_status=review_status
                    )
                    db.add(fact)
                    saved_count += 1
                except Exception as e:
                    print(f"⚠️ Failed to save fact '{fact_data.fact_text[:30]}...': {e}")
                    continue

            job.status = JobStatus.COMPLETED
            job.current_step = JOB_STEP_DONE
            job.steps_completed = 5
            job.result_summary = {
                "source_title": page_title,
                "facts_count": saved_count,
                "auto_flagged_count": auto_flagged_count,
                "summary": extraction_result.summary_brief,
                "source_type": source_type.value,
                "content_formats": {
                    "has_markdown": bool(content_formats.get("markdown")),
                    "has_html": bool(content_formats.get("html_clean"))
                }
            }
            db.add(job)
            db.commit()
            
        except Exception as e:
            db.rollback()
            traceback.print_exc()
            job = db.get(Job, job_id)
            if not job:
                return
            error_code = "UNSUPPORTED"
            err_msg = str(e).lower()
            if "429" in err_msg or "rate limit" in err_msg:
                error_code = "RATE_LIMIT"
            elif "403" in err_msg or "401" in err_msg or "paywall" in err_msg or "forbidden" in err_msg:
                error_code = "PAYWALL"
            elif "timeout" in err_msg or "connection" in err_msg or "refused" in err_msg:
                error_code = "NETWORK"
            elif "transcript" in err_msg or "disabled" in err_msg or "not available" in err_msg:
                error_code = "TRANSCRIPT_DISABLED"
            user_message = str(e)
            if len(user_message) > 120:
                user_message = user_message[:117] + "..."
            _set_job_failed(job, error_code, user_message, getattr(job, "result_summary", None))
            db.add(job)
            db.commit()


@celery_app.task(bind=True, name="ingest_media", soft_time_limit=300, time_limit=600)
def ingest_media_task(self, job_id: str) -> None:
    """Transcribe uploaded audio/video and extract facts."""
    job_id = as_uuid(job_id)
    with Session(engine) as db:
        job = db.get(Job, job_id)
        if not job or job.type != "file_ingest":
            return
        params = job.params or {}
        file_path = params.get("path")
        filename = params.get("filename", "media")

        if not file_path:
            _set_job_failed(job, "UNSUPPORTED", "Missing file path", params)
            db.add(job)
            db.commit()
            return

        try:
            job.current_step = JOB_STEP_EXTRACTING
            job.status = JobStatus.RUNNING
            db.add(job)
            db.commit()

            from app.services.transcribe import transcribe_audio

            segments = transcribe_audio(file_path)
            parts = [f"## [{s.get('start_s', 0)}-{s.get('end_s', 0)}]\n{s.get('text', '')}" for s in segments]
            text_content = "\n\n".join(parts) if parts else ""

            if not (text_content or "").strip():
                _set_job_failed(job, "EMPTY_CONTENT", "No speech could be transcribed.", params)
                db.add(job)
                db.commit()
                return

            content_formats = {"text_raw": text_content, "markdown": text_content, "html_clean": None}
            metadata_json = {"filename": filename, "path": file_path, "transcript": segments}
            content_hash = hashlib.md5((text_content or "").encode("utf-8")).hexdigest()
            media_url = f"media://{job.project_id}/{content_hash}"
            page_title = filename

            source_doc = SourceDoc(
                id=uuid.uuid4(),
                project_id=job.project_id,
                workspace_id=job.workspace_id,
                url=media_url,
                domain="media",
                title=page_title,
                source_type=SourceType.MEDIA,
                canonical_url=media_url,
                metadata_json=metadata_json,
                content_text=text_content,
                content_text_raw=content_formats["text_raw"],
                content_markdown=content_formats["markdown"],
                content_html_clean=content_formats["html_clean"],
                content_s3_path="",
                content_hash=content_hash,
            )
            db.add(source_doc)
            db.commit()
            db.refresh(source_doc)

            job.current_step = JOB_STEP_FACTING
            job.steps_completed = 3
            db.add(job)
            db.commit()

            extraction_result = extract_facts_from_markdown((text_content or "")[:25000])

            job.current_step = JOB_STEP_FACTING
            job.steps_completed = 4
            db.add(job)
            db.commit()

            saved_count = 0
            auto_flagged_count = 0
            for fact_data in extraction_result.facts:
                try:
                    confidence_score = 85 if fact_data.confidence == "HIGH" else (60 if fact_data.confidence == "MEDIUM" else 40)
                    review_status = ReviewStatus.PENDING if confidence_score >= 75 else ReviewStatus.NEEDS_REVIEW
                    if review_status == ReviewStatus.NEEDS_REVIEW:
                        auto_flagged_count += 1
                    quote = fact_data.quote_span
                    start_raw, end_raw = find_quote_offsets(content_formats["text_raw"], quote)
                    start_md, end_md = find_quote_offsets(content_formats.get("markdown"), quote)
                    evidence_snippet = quote[:500] if quote and len(quote) > 10 else None
                    if evidence_snippet and len(quote or "") > 500:
                        evidence_snippet = quote[:500]
                    sect_ctx, fact_source_url = _resolve_fact_source_url(
                        fact_data.section_context, SourceType.MEDIA, metadata_json, media_url
                    )
                    fact = ResearchNode(
                        id=uuid.uuid4(),
                        project_id=job.project_id,
                        source_doc_id=source_doc.id,
                        fact_text=fact_data.fact_text,
                        is_key_claim=fact_data.is_key_claim,
                        confidence_score=confidence_score,
                        section_context=sect_ctx or fact_data.section_context,
                        source_url=fact_source_url,
                        quote_text_raw=quote,
                        evidence_snippet=evidence_snippet,
                        evidence_start_char_raw=start_raw,
                        evidence_end_char_raw=end_raw,
                        evidence_start_char_md=start_md,
                        evidence_end_char_md=end_md,
                        tags=fact_data.tags or [],
                        review_status=review_status
                    )
                    db.add(fact)
                    saved_count += 1
                except Exception as e:
                    print(f"⚠️ Failed to save fact '{fact_data.fact_text[:30]}...': {e}")
                    continue

            job.status = JobStatus.COMPLETED
            job.current_step = JOB_STEP_DONE
            job.steps_completed = 5
            job.result_summary = {
                "source_title": page_title,
                "facts_count": saved_count,
                "auto_flagged_count": auto_flagged_count,
                "summary": extraction_result.summary_brief,
                "source_type": "MEDIA",
            }
            db.add(job)
            db.commit()

        except Exception as e:
            db.rollback()
            traceback.print_exc()
            job = db.get(Job, job_id)
            if not job:
                return
            err_msg = str(e).lower()
            error_code = "TRANSCRIPT_FAILED" if "transcribe" in err_msg or "whisper" in err_msg or "file" in err_msg else "UNSUPPORTED"
            user_message = str(e)
            if len(user_message) > 120:
                user_message = user_message[:117] + "..."
            _set_job_failed(job, error_code, user_message, params)
            db.add(job)
            db.commit()