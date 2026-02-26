"""
YouTube transcript extraction: title, channel, segments (start_s, end_s, text), video_url.
Uses youtube-transcript-api when available (no API key). Captions-only; no audio download.
Tests must use a fixture-based provider; do not rely on live YouTube (see .cursorrules).
"""
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

from urllib.parse import urlparse, parse_qs


@runtime_checkable
class YouTubeTranscriptProvider(Protocol):
    """Interface for transcript fetching. Default = real API; tests = fixture-based (no network)."""

    def get_transcript(self, video_id: str) -> Optional[List[Dict[str, Any]]]:
        """Return raw segments [{start, duration, text}] or None if captions unavailable."""
        ...


class DefaultTranscriptProvider:
    """Real captions fetcher (youtube-transcript-api). Use in production only."""

    def get_transcript(self, video_id: str) -> Optional[List[Dict[str, Any]]]:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            return YouTubeTranscriptApi.get_transcript(video_id)
        except Exception as e:
            print(f"⚠️ YouTube transcript failed: {e}")
            return None


_default_provider: Optional[YouTubeTranscriptProvider] = None


def get_default_transcript_provider() -> YouTubeTranscriptProvider:
    """Default provider = real captions fetcher. Tests must inject a fixture-based provider."""
    global _default_provider
    if _default_provider is None:
        _default_provider = DefaultTranscriptProvider()
    return _default_provider


def extract_youtube(
    url: str,
    transcript_provider: Optional[YouTubeTranscriptProvider] = None,
) -> Dict[str, Any]:
    """
    Fetch transcript and video metadata (captions-only).
    Returns: title, channel, transcript[] (start_s, end_s, text), video_url.
    URL is normalized to canonical form (no ?si= etc). Tests must pass a fixture-based provider (no live YouTube).
    """
    result: Dict[str, Any] = {
        "title": "",
        "channel": "",
        "transcript": [],
        "video_url": _normalize_youtube_url(url),
    }
    video_id = _video_id_from_url(url)
    if not video_id:
        return result

    provider = transcript_provider or get_default_transcript_provider()
    transcript_list = provider.get_transcript(video_id)
    if transcript_list is None or len(transcript_list) == 0:
        return result

    segments = []
    for item in transcript_list:
        start = item.get("start", 0)
        duration = item.get("duration", 0)
        segments.append({
            "start_s": round(start, 1),
            "end_s": round(start + duration, 1),
            "text": (item.get("text") or "").strip(),
        })
    result["transcript"] = segments

    # Optional: fetch title/channel from oEmbed or page (no key)
    try:
        import requests
        oembed_url = f"https://www.youtube.com/oembed?url={result['video_url']}"
        r = requests.get(oembed_url, timeout=5)
        if r.ok:
            j = r.json()
            result["title"] = j.get("title", "")
            result["channel"] = j.get("author_name", "")
    except Exception:
        pass

    if not result["title"]:
        result["title"] = f"YouTube video {video_id}"

    return result


def _normalize_youtube_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        if "youtu.be" in (parsed.netloc or ""):
            vid = (parsed.path or "").strip("/").split("/")[0]
            return f"https://www.youtube.com/watch?v={vid}" if vid else url
        if "youtube.com" in (parsed.netloc or ""):
            qs = parse_qs(parsed.query or "")
            v = qs.get("v", [])
            if v:
                return f"https://www.youtube.com/watch?v={v[0]}"
    except Exception:
        pass
    return url


def _video_id_from_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        if "youtu.be" in (parsed.netloc or ""):
            return (parsed.path or "").strip("/").split("/")[0]
        if "youtube.com" in (parsed.netloc or ""):
            qs = parse_qs(parsed.query or "")
            v = qs.get("v", [])
            return v[0] if v else ""
    except Exception:
        pass
    return ""
