"""
Minimal unit test for YouTube fixture loader (no network).
"""
from tests.helpers.youtube_fixtures import load_youtube_fixture


def test_youtube_fixture_has_transcript_when_captions_available():
    fx = load_youtube_fixture("6MBq1paspVU")
    assert fx.captions_available is True
    assert fx.transcript_text
    assert "00:" in fx.transcript_text
