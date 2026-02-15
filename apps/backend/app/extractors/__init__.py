"""
Multi-source extractors: Reddit, YouTube, generic Web.
"""
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from app.models import SourceType

# Lazy imports from submodules to avoid loading heavy deps when not needed


def detect_source_type(url: str) -> SourceType:
    """Detect source type from URL hostname."""
    try:
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        if "reddit.com" in host or "old.reddit.com" in host:
            return SourceType.REDDIT
        if "youtube.com" in host or "youtu.be" in host or "www.youtube.com" in host:
            return SourceType.YOUTUBE
    except Exception:
        pass
    return SourceType.WEB


def normalize_url(url: str, source_type: SourceType) -> str:
    """Normalize URL for idempotency and display."""
    if source_type == SourceType.REDDIT:
        return _normalize_reddit_url(url)
    if source_type == SourceType.YOUTUBE:
        return _normalize_youtube_url(url)
    return url


def _normalize_reddit_url(url: str) -> str:
    """Normalize to https://www.reddit.com/r/{sub}/comments/{id}/{slug}/"""
    try:
        parsed = urlparse(url)
        path = (parsed.path or "").strip("/")
        parts = path.split("/")
        # /r/Subreddit/comments/ID/slug/ or /comments/ID/slug/
        if "comments" in parts:
            idx = parts.index("comments")
            if idx + 1 < len(parts):
                post_id = parts[idx + 1]
                slug = parts[idx + 2] if idx + 2 < len(parts) else ""
                sub = parts[parts.index("r") + 1] if "r" in parts and parts.index("r") < idx else "reddit"
                base = f"https://www.reddit.com/r/{sub}/comments/{post_id}"
                return f"{base}/{slug}/" if slug else f"{base}/"
    except Exception:
        pass
    return url


def _normalize_youtube_url(url: str) -> str:
    """Normalize to https://www.youtube.com/watch?v={videoId}"""
    try:
        parsed = urlparse(url)
        if "youtu.be" in (parsed.netloc or ""):
            vid = (parsed.path or "").strip("/").split("/")[0]
            return f"https://www.youtube.com/watch?v={vid}" if vid else url
        if "youtube.com" in (parsed.netloc or ""):
            from urllib.parse import parse_qs
            qs = parse_qs(parsed.query or "")
            v = qs.get("v", [])
            if v:
                return f"https://www.youtube.com/watch?v={v[0]}"
    except Exception:
        pass
    return url


def extract(url: str, source_type: SourceType, html_content: Optional[str] = None) -> Dict[str, Any]:
    """
    Extract structured content by source type.
    For WEB, html_content is required. For REDDIT/YOUTUBE, we fetch (or use stub in E2E).
    """
    if source_type == SourceType.REDDIT:
        from app.extractors.reddit import extract_reddit
        return extract_reddit(url)
    if source_type == SourceType.YOUTUBE:
        from app.extractors.youtube import extract_youtube
        return extract_youtube(url)
    from app.extractors.web import extract_web
    out = extract_web(url, html_content or "")
    # Align keys with ingest_task expectations
    return {
        "title": out.get("title"),
        "text_raw": out.get("text_raw"),
        "markdown": out.get("markdown"),
        "html_clean": out.get("html_clean"),
    }
