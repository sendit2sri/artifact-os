"""
Generic webpage extraction: title + text/markdown/html.
Wraps trafilatura + BeautifulSoup fallback.
"""
import re
from typing import Dict, Any, Optional

from bs4 import BeautifulSoup

# Reuse sanitize from workers to avoid circular import; minimal copy for extractor use
try:
    import bleach
    ALLOWED_TAGS = [
        'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'code', 'pre', 'hr', 'div', 'span',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img', 'figure', 'figcaption'
    ]
    ALLOWED_ATTRIBUTES = {'*': ['class', 'id'], 'a': ['href', 'title', 'rel'], 'img': ['src', 'alt', 'title', 'width', 'height'], 'code': ['class'], 'pre': ['class']}

    def _sanitize(html: Optional[str]) -> Optional[str]:
        if not html:
            return None
        try:
            return bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES, strip=True)
        except Exception:
            return None
except ImportError:
    def _sanitize(html: Optional[str]) -> Optional[str]:
        return html


def extract_web(url: str, html_content: str) -> Dict[str, Any]:
    """
    Extract title and content from HTML.
    Returns: { "title": str, "text_raw": str, "markdown": str|None, "html_clean": str|None }
    """
    result: Dict[str, Any] = {
        "title": None,
        "text_raw": None,
        "markdown": None,
        "html_clean": None,
    }
    if not html_content:
        return result

    try:
        soup = BeautifulSoup(html_content, "html.parser")
        result["title"] = soup.title.string if soup.title else url
    except Exception:
        result["title"] = url

    try:
        try:
            import trafilatura
            extracted = trafilatura.extract(
                html_content,
                output_format="json",
                include_comments=False,
                include_tables=True,
                no_fallback=False,
            )
            if extracted:
                import json
                data = json.loads(extracted) if isinstance(extracted, str) else extracted
                result["text_raw"] = data.get("text", "") or ""
                md = trafilatura.extract(
                    html_content,
                    output_format="markdown",
                    include_comments=False,
                    include_tables=True,
                    no_fallback=False,
                )
                if md:
                    result["markdown"] = md
        except ImportError:
            pass
        except Exception:
            pass

        if not result["text_raw"]:
            soup = BeautifulSoup(html_content, "html.parser")
            for el in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
                el.decompose()
            main = None
            for sel in ["main", "article", '[role="main"]', ".main-content", "#content", ".content"]:
                main = soup.select_one(sel)
                if main:
                    break
            area = main if main else soup.body
            if area:
                result["html_clean"] = _sanitize(str(area))
                text = area.get_text(separator="\n").strip()
                text = re.sub(r"\n{3,}", "\n\n", text)
                text = re.sub(r" {2,}", " ", text)
                result["text_raw"] = text

        if not result["text_raw"]:
            soup = BeautifulSoup(html_content, "html.parser")
            result["text_raw"] = soup.get_text(separator="\n").strip()
    except Exception as e:
        print(f"⚠️ Web extraction failed: {e}")
        soup = BeautifulSoup(html_content, "html.parser")
        result["text_raw"] = soup.get_text(separator="\n").strip()

    return result
