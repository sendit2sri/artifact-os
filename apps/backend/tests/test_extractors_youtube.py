"""
YouTube extractor unit tests. Uses transcript fetcher mock (no live YouTube in CI).
Golden URLs (manual smoke only): with captions 6MBq1paspVU, without captions HpMPhOtT3Ow.
"""
import pytest
from app.extractors.youtube import (
    extract_youtube,
    _normalize_youtube_url,
    _video_id_from_url,
)

# Canonical forms (no ?si=)
URL_WITH_CAPTIONS = "https://www.youtube.com/watch?v=6MBq1paspVU"
URL_WITHOUT_CAPTIONS = "https://www.youtube.com/watch?v=HpMPhOtT3Ow"
URL_YOUTU_BE_SI = "https://youtu.be/6MBq1paspVU?si=dY76HXfKggj4nHIP"

FIXTURE_WITH_CAPTIONS = [
    {"start": 0.0, "duration": 2.5, "text": "Hello world."},
    {"start": 2.5, "duration": 1.5, "text": "Second segment."},
]


def test_normalize_youtube_url_drops_si():
    """Normalize to canonical form: no ?si= or other query params."""
    assert _normalize_youtube_url(URL_YOUTU_BE_SI) == URL_WITH_CAPTIONS
    assert _normalize_youtube_url(URL_WITH_CAPTIONS) == URL_WITH_CAPTIONS


def test_video_id_from_url_ignores_si():
    """video_id is taken from v= or youtu.be path only."""
    assert _video_id_from_url(URL_YOUTU_BE_SI) == "6MBq1paspVU"
    assert _video_id_from_url(URL_WITH_CAPTIONS) == "6MBq1paspVU"
    assert _video_id_from_url(URL_WITHOUT_CAPTIONS) == "HpMPhOtT3Ow"


def test_extract_youtube_with_captions_fixture():
    """With captions: mock returns transcript segments → transcript populated, video_url canonical."""
    def fetcher(video_id: str):
        assert video_id in ("6MBq1paspVU", "HpMPhOtT3Ow")
        return FIXTURE_WITH_CAPTIONS.copy()

    out = extract_youtube(URL_YOUTU_BE_SI, transcript_fetcher=fetcher)
    assert out["video_url"] == URL_WITH_CAPTIONS
    assert len(out["transcript"]) == 2
    assert out["transcript"][0]["text"] == "Hello world."
    assert out["transcript"][0]["start_s"] == 0.0
    assert out["transcript"][0]["end_s"] == 2.5
    assert out["transcript"][1]["text"] == "Second segment."
    # Title may come from oEmbed (network) or fallback
    assert out["title"] and len(out["title"]) > 0


def test_extract_youtube_without_captions_fixture():
    """Without captions: mock returns None → transcript empty, video_url still canonical (no broken job)."""
    def fetcher(video_id: str):
        return None  # CAPTIONS_UNAVAILABLE

    out = extract_youtube(URL_WITHOUT_CAPTIONS, transcript_fetcher=fetcher)
    assert out["video_url"] == URL_WITHOUT_CAPTIONS
    assert out["transcript"] == []
    assert "YouTube video" in out["title"] or out["title"] == ""


def test_extract_youtube_empty_list_treated_as_unavailable():
    """Empty list from fetcher is treated like None: transcript empty."""
    def fetcher(video_id: str):
        return []

    out = extract_youtube(URL_WITH_CAPTIONS, transcript_fetcher=fetcher)
    assert out["transcript"] == []
    assert out["video_url"] == URL_WITH_CAPTIONS


def test_extract_youtube_invalid_url_returns_empty():
    """Invalid or non-YouTube URL returns empty transcript and original url."""
    out = extract_youtube("https://example.com/not-youtube", transcript_fetcher=lambda v: [{"start": 0, "duration": 1, "text": "x"}])
    assert out["transcript"] == []
    assert out["video_url"] == "https://example.com/not-youtube"
