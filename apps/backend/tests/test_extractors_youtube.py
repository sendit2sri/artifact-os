"""
YouTube extractor unit tests. Uses transcript fetcher mock + JSON fixtures (no live YouTube in CI).
Golden URLs (manual smoke only): with captions 6MBq1paspVU, without captions HpMPhOtT3Ow.
"""
import pytest
from app.extractors.youtube import (
    extract_youtube,
    _normalize_youtube_url,
    _video_id_from_url,
)
from tests.fixtures.youtube import FixtureTranscriptProvider, load_fixture, segments_for_fetcher

# Canonical forms (no ?si=)
URL_WITH_CAPTIONS = "https://www.youtube.com/watch?v=6MBq1paspVU"
URL_WITHOUT_CAPTIONS = "https://www.youtube.com/watch?v=HpMPhOtT3Ow"
URL_YOUTU_BE_SI = "https://youtu.be/6MBq1paspVU?si=dY76HXfKggj4nHIP"

VIDEO_WITH_CAPTIONS = "6MBq1paspVU"
VIDEO_WITHOUT_CAPTIONS = "HpMPhOtT3Ow"


def test_normalize_youtube_url_drops_si():
    """Normalize to canonical form: no ?si= or other query params."""
    assert _normalize_youtube_url(URL_YOUTU_BE_SI) == URL_WITH_CAPTIONS
    assert _normalize_youtube_url(URL_WITH_CAPTIONS) == URL_WITH_CAPTIONS


def test_video_id_from_url_ignores_si():
    """video_id is taken from v= or youtu.be path only."""
    assert _video_id_from_url(URL_YOUTU_BE_SI) == VIDEO_WITH_CAPTIONS
    assert _video_id_from_url(URL_WITH_CAPTIONS) == VIDEO_WITH_CAPTIONS
    assert _video_id_from_url(URL_WITHOUT_CAPTIONS) == VIDEO_WITHOUT_CAPTIONS


def test_load_fixture_with_captions():
    """Fixture 6MBq1paspVU has captions_available true and transcript_text."""
    fixture = load_fixture(VIDEO_WITH_CAPTIONS)
    assert fixture is not None
    assert fixture["captions_available"] is True
    assert fixture.get("transcript_text")
    assert "lithium" in (fixture.get("transcript_text") or "").lower()
    assert len(fixture.get("segments") or []) == 4


def test_load_fixture_without_captions():
    """Fixture HpMPhOtT3Ow has captions_available false, no transcript."""
    fixture = load_fixture(VIDEO_WITHOUT_CAPTIONS)
    assert fixture is not None
    assert fixture["captions_available"] is False
    assert fixture.get("transcript_text") is None
    assert (fixture.get("segments") or []) == []


def test_segments_for_fetcher_with_captions():
    """segments_for_fetcher converts fixture segments to fetcher format (start, duration, text)."""
    fixture = load_fixture(VIDEO_WITH_CAPTIONS)
    segs = segments_for_fetcher(fixture)
    assert segs is not None
    assert len(segs) == 4
    assert segs[0]["start"] == 0.0
    assert segs[0]["duration"] == 12.0
    assert "lithium" in (segs[0]["text"] or "").lower()


def test_segments_for_fetcher_without_captions():
    """segments_for_fetcher returns None when captions_available is false."""
    fixture = load_fixture(VIDEO_WITHOUT_CAPTIONS)
    assert segments_for_fetcher(fixture) is None


def test_extract_youtube_with_captions_fixture():
    """With captions: fixture provider returns segments → transcript populated, video_url canonical (no network)."""
    out = extract_youtube(URL_YOUTU_BE_SI, transcript_provider=FixtureTranscriptProvider())
    assert out["video_url"] == URL_WITH_CAPTIONS
    assert len(out["transcript"]) == 4
    assert "lithium" in (out["transcript"][0]["text"] or "").lower()
    assert out["transcript"][0]["start_s"] == 0.0
    assert out["transcript"][0]["end_s"] == 12.0
    # Title may come from oEmbed (network) or fallback
    assert out["title"] and len(out["title"]) > 0


def test_extract_youtube_without_captions_fixture():
    """Without captions: fixture provider returns None → transcript empty (no network)."""
    out = extract_youtube(URL_WITHOUT_CAPTIONS, transcript_provider=FixtureTranscriptProvider())
    assert out["video_url"] == URL_WITHOUT_CAPTIONS
    assert out["transcript"] == []
    assert "YouTube video" in out["title"] or out["title"] == ""


def test_extract_youtube_empty_list_treated_as_unavailable():
    """Empty list from provider is treated like None: transcript empty."""
    class EmptyProvider:
        def get_transcript(self, video_id: str):
            return []

    out = extract_youtube(URL_WITH_CAPTIONS, transcript_provider=EmptyProvider())
    assert out["transcript"] == []
    assert out["video_url"] == URL_WITH_CAPTIONS


def test_extract_youtube_invalid_url_returns_empty():
    """Invalid or non-YouTube URL returns empty transcript and original url."""
    class StubProvider:
        def get_transcript(self, video_id: str):
            return [{"start": 0, "duration": 1, "text": "x"}]

    out = extract_youtube("https://example.com/not-youtube", transcript_provider=StubProvider())
    assert out["transcript"] == []
    assert out["video_url"] == "https://example.com/not-youtube"
