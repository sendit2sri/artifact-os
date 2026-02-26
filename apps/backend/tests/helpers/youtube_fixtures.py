from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "youtube"


@dataclass(frozen=True)
class TranscriptSegment:
    start_s: float
    dur_s: float
    text: str


@dataclass(frozen=True)
class YouTubeTranscriptFixture:
    provider: str
    video_id: str
    url: str
    language: Optional[str]
    source: str
    captions_available: bool
    transcript_text: Optional[str]
    segments: list[TranscriptSegment]


def load_youtube_fixture(video_id: str) -> YouTubeTranscriptFixture:
    """
    Loads apps/backend/tests/fixtures/youtube/<video_id>.json

    This is intended for unit tests; do not call external services.
    """
    path = FIXTURES_DIR / f"{video_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Fixture not found: {path}")

    raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))

    segments_raw = raw.get("segments") or []
    segments = [
        TranscriptSegment(
            start_s=float(s.get("start_s", 0.0)),
            dur_s=float(s.get("dur_s", 0.0)),
            text=str(s.get("text", "")),
        )
        for s in segments_raw
    ]

    return YouTubeTranscriptFixture(
        provider=str(raw.get("provider", "youtube")),
        video_id=str(raw["video_id"]),
        url=str(raw["url"]),
        language=raw.get("language"),
        source=str(raw.get("source", "captions")),
        captions_available=bool(raw.get("captions_available", False)),
        transcript_text=raw.get("transcript_text"),
        segments=segments,
    )
