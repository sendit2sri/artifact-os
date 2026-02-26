"""
YouTube transcript fixtures for tests (no live YouTube in CI).
Load with load_fixture(video_id); use segments_for_fetcher(fixture) to feed extract_youtube's transcript_fetcher.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, TypedDict

FIXTURES_DIR = Path(__file__).resolve().parent


class TranscriptSegment(TypedDict, total=False):
    start_s: float
    dur_s: float
    text: str


class TranscriptFixture(TypedDict, total=False):
    provider: str
    video_id: str
    url: str
    language: Optional[str]
    source: str
    captions_available: bool
    transcript_text: Optional[str]
    segments: List[TranscriptSegment]


def load_fixture(video_id: str) -> Optional[TranscriptFixture]:
    """
    Load YouTube transcript fixture for video_id.
    Returns typed fixture dict or None if file not found.
    """
    path = FIXTURES_DIR / f"{video_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data


def segments_for_fetcher(fixture: Optional[TranscriptFixture]) -> Optional[List[Dict[str, Any]]]:
    """
    Convert fixture segments to format expected by extract_youtube's transcript_fetcher
    (start, duration, text). Returns None if captions_available is false or no segments.
    """
    if not fixture or not fixture.get("captions_available"):
        return None
    segs = fixture.get("segments") or []
    if not segs:
        return None
    return [
        {
            "start": float(s.get("start_s", 0)),
            "duration": float(s.get("dur_s", 0)),
            "text": (s.get("text") or "").strip(),
        }
        for s in segs
    ]
