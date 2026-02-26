"""Self-hosted Whisper transcription for audio/video files."""
import os
from typing import List, Dict, Any


def transcribe_audio(path: str) -> List[Dict[str, Any]]:
    """
    Transcribe audio/video file to segments.
    Returns list of { start_s, end_s, text }.
    """
    if not path or not os.path.isfile(path):
        raise FileNotFoundError(f"File not found: {path}")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise ImportError(
            "faster-whisper is required for media transcription. "
            "Install with: pip install faster-whisper"
        )

    model_name = os.environ.get("WHISPER_MODEL", "base")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(path, beam_size=1)

    result = []
    for seg in segments:
        result.append({
            "start_s": seg.start,
            "end_s": seg.end,
            "text": (seg.text or "").strip(),
        })
    return result
