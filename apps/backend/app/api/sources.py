from fastapi import APIRouter, HTTPException, Query
from sqlmodel import Session, select
from app.db.session import engine
from app.models import SourceDoc, ResearchNode
from app.utils.content_formatter import format_for_reader
from typing import Literal, Optional
import uuid
import bleach

router = APIRouter()

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

@router.get("/projects/{project_id}/sources/content")
def get_source_content(
    project_id: str, 
    url: str = Query(...),
    mode: Literal["text", "markdown", "html", "auto"] = Query(default="auto")
):
    """
    Get source content in multiple formats with metadata.
    
    Args:
        project_id: Project UUID
        url: Source URL
        mode: Primary content format to return in 'content' field
            - "text": Raw extracted text (whitespace preserved)
            - "markdown": Clean markdown when available
            - "html": Sanitized HTML when available
            - "auto": Best available format (markdown > html > text)
    
    Returns:
        {
            "content": str,              # Primary content in requested format
            "format": str,               # Actual format returned ("text"|"markdown"|"html")
            "text": str | None,          # Raw text (always available)
            "markdown": str | None,      # Markdown format (if available)
            "html": str | None,          # Sanitized HTML (if available)
            "title": str | None,         # Page title
            "url": str,                  # Source URL
            "domain": str                # Domain name
        }
    """
    with Session(engine) as db:
        try:
            p_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Project UUID")

        # Strategy 1: Strict Lookup (Project + URL)
        statement = select(SourceDoc).where(
            SourceDoc.project_id == p_uuid,
            SourceDoc.url == url
        )
        doc = db.exec(statement).first()

        # Strategy 2: Fallback - Find via Fact Linkage
        if not doc:
            print(f"⚠️ Strict lookup failed for {url}. Trying linkage lookup...")
            
            linked_statement = (
                select(SourceDoc)
                .join(ResearchNode, ResearchNode.source_doc_id == SourceDoc.id)
                .where(ResearchNode.project_id == p_uuid)
                .where(SourceDoc.url == url)
            )
            doc = db.exec(linked_statement).first()

        if not doc:
            print(f"❌ Document truly not found for URL: {url}")
            raise HTTPException(status_code=404, detail="Source document not found")
        
        # Get all available formats
        text_content = doc.content_text_raw or doc.content_text
        markdown_content = doc.content_markdown
        html_content = sanitize_html(doc.content_html_clean) if doc.content_html_clean else None
        
        # Create reader-optimized markdown from text if no markdown exists
        reader_markdown = None
        if text_content and not markdown_content:
            reader_markdown = format_for_reader(text_content)
        elif markdown_content:
            # Light formatting pass on existing markdown
            reader_markdown = format_for_reader(markdown_content)
        
        # Select primary content based on mode
        primary_content = None
        format_used = "text"
        
        if mode == "text":
            primary_content = text_content
            format_used = "text"
        
        elif mode == "markdown":
            if markdown_content:
                primary_content = markdown_content
                format_used = "markdown"
            else:
                primary_content = text_content
                format_used = "text"
        
        elif mode == "html":
            if html_content:
                primary_content = html_content
                format_used = "html"
            else:
                primary_content = text_content
                format_used = "text"
        
        else:  # mode == "auto"
            # Prefer reader markdown > markdown > html > text
            if reader_markdown:
                primary_content = reader_markdown
                format_used = "markdown"
            elif markdown_content:
                primary_content = markdown_content
                format_used = "markdown"
            elif html_content:
                primary_content = html_content
                format_used = "html"
            else:
                primary_content = text_content
                format_used = "text"
        
        if not primary_content:
            primary_content = "No content available for this source."
        
        return {
            "content": primary_content,
            "format": format_used,
            "text": text_content,
            "markdown": reader_markdown or markdown_content,  # Return formatted version
            "html": html_content,
            "title": doc.title,
            "url": doc.url,
            "domain": doc.domain
        }