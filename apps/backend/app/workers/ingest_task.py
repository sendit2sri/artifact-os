import uuid
import hashlib
import traceback
from typing import Dict, Optional, Tuple
from sqlmodel import Session, select
from app.db.session import engine
from app.workers.celery_app import celery_app
from app.models import Job, JobStatus, SourceDoc, ResearchNode, IntegrityStatus, ReviewStatus
from app.services.llm import extract_facts_from_markdown
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
    normalize = lambda s: ' '.join(s.split())
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
def ingest_url_task(self, job_id: str, url: str):
    with Session(engine) as db:
        job = db.get(Job, job_id)
        if not job: return
        
        try:
            job.status = JobStatus.RUNNING
            db.add(job)
            db.commit()
            
            # 1. Scrape Content
            job.current_step = "Fetching content..."
            db.add(job)
            db.commit()
            
            headers = {"User-Agent": "Mozilla/5.0 (ArtifactOS Research Bot)"}
            resp = requests.get(url, headers=headers, timeout=15)
            resp.raise_for_status()
            
            # 2. Extract Multiple Content Formats
            job.current_step = "Extracting content..."
            db.add(job)
            db.commit()
            
            content_formats = clean_main_content(resp.text, url)
            
            # Use text_raw as primary content for hashing and fact extraction
            text_content = content_formats["text_raw"] or ""
            
            # Hash content
            content_hash = hashlib.md5(text_content.encode("utf-8")).hexdigest()
            
            # 3. Save Source Document
            job.current_step = "Saving source document..."
            db.add(job)
            db.commit()
            
            # Extract title from HTML
            soup = BeautifulSoup(resp.text, "html.parser")
            page_title = soup.title.string if soup.title else url
            
            existing_doc = db.exec(
                select(SourceDoc).where(
                    SourceDoc.project_id == job.project_id, 
                    SourceDoc.url == url
                )
            ).first()
            
            if existing_doc:
                source_doc = existing_doc
                source_doc.title = page_title
                source_doc.content_text = text_content  # Legacy field
                source_doc.content_text_raw = content_formats["text_raw"]
                source_doc.content_markdown = content_formats["markdown"]
                source_doc.content_html_clean = content_formats["html_clean"]
                source_doc.content_hash = content_hash
            else:
                source_doc = SourceDoc(
                    id=uuid.uuid4(),
                    project_id=job.project_id,
                    workspace_id=job.workspace_id,
                    url=url,
                    domain=url.split("//")[-1].split("/")[0],
                    title=page_title,
                    content_text=text_content,  # Legacy field
                    content_text_raw=content_formats["text_raw"],
                    content_markdown=content_formats["markdown"],
                    content_html_clean=content_formats["html_clean"],
                    content_s3_path="", 
                    content_hash=content_hash
                )
                db.add(source_doc)
            
            db.commit()
            db.refresh(source_doc)
            
            # 4. Extract Facts
            job.current_step = "Extracting facts with AI..."
            job.steps_completed = 3
            db.add(job)
            db.commit()
            
            extraction_result = extract_facts_from_markdown(text_content[:25000])
            
            # 5. Save Facts
            job.current_step = "Saving facts..."
            job.steps_completed = 4
            db.add(job)
            db.commit()
            
            saved_count = 0
            for fact_data in extraction_result.facts: 
                try:
                    # Determine Integrity Status safely
                    # We cast to string just in case your DB expects a string
                    status = IntegrityStatus.VERIFIED if fact_data.confidence == "HIGH" else IntegrityStatus.NEEDS_REVIEW
                    
                    # Map confidence to numeric score
                    confidence_score = 85 if fact_data.confidence == "HIGH" else 60
                    
                    # ✅ STEP #7: Auto-assign review_status based on confidence score
                    # Low confidence (< 75) automatically goes to Needs Review
                    review_status = ReviewStatus.NEEDS_REVIEW if confidence_score < 75 else ReviewStatus.PENDING
                    
                    # Calculate evidence offsets for precise highlighting
                    quote = fact_data.quote_span
                    start_raw, end_raw = find_quote_offsets(content_formats["text_raw"], quote)
                    start_md, end_md = find_quote_offsets(content_formats["markdown"], quote)
                    
                    fact = ResearchNode(
                        id=uuid.uuid4(),
                        project_id=job.project_id,
                        source_doc_id=source_doc.id,
                        fact_text=fact_data.fact_text,
                        is_key_claim=fact_data.is_key_claim,
                        confidence_score=confidence_score,
                        section_context=fact_data.section_context,
                        quote_text_raw=quote,
                        # Store evidence offsets for precise highlighting
                        evidence_start_char_raw=start_raw,
                        evidence_end_char_raw=end_raw,
                        evidence_start_char_md=start_md,
                        evidence_end_char_md=end_md,
                        tags=fact_data.tags or [],
                        integrity_status=status,
                        review_status=review_status  # Auto-assign based on confidence
                    )
                    db.add(fact)
                    saved_count += 1
                except Exception as e:
                    print(f"⚠️ Failed to save fact '{fact_data.fact_text[:30]}...': {e}")
                    # Continue to next fact so one error doesn't kill the job
                    continue

            # 6. Update Job
            job.status = JobStatus.COMPLETED
            job.current_step = "Completed"
            job.steps_completed = 5
            job.result_summary = {
                "source_title": page_title,
                "facts_count": saved_count,
                "summary": extraction_result.summary_brief,
                "content_formats": {
                    "has_markdown": bool(content_formats["markdown"]),
                    "has_html": bool(content_formats["html_clean"])
                }
            }
            db.add(job)
            db.commit()
            
        except Exception as e:
            db.rollback() 
            print(f"❌ Worker Failed: {e}")
            # ✅ PRINT FULL TRACEBACK to see where the error actually is
            traceback.print_exc()
            
            job.status = JobStatus.FAILED
            job.result_summary = {"error": str(e)}
            db.add(job)
            db.commit()