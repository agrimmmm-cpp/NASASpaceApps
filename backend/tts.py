"""Nova's voice: Gemini text-to-speech behind POST /api/tts (docs/02_API_CONTRACT.md changelog, 2026-11-15).

- Uses the same key as the LLM layer (LLM_API_KEY), only when LLM_BASE_URL points at Google's Generative Language API
  (or TTS_PROVIDER=gemini). The key stays on the backend and is never logged (I-12).
- Any failure (no key, timeout, HTTP error, rate limit) raises TTSUnavailable; the endpoint answers 503 with the error
  envelope and the frontend falls back to the browser's own speech voice. The demo never depends on it (I-20).
- Responses are cached in memory (same text = instant replay, no extra quota) and calls are rate-limited per process.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import struct
import threading
import time
from collections import OrderedDict, deque

import httpx

import config

log = logging.getLogger("fire.tts")

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.8-flash-lite-tts"   # ~3 s for a sentence; set TTS_MODEL=gemini-3.8-flash-tts for richer audio
DEFAULT_VOICE = "Kore"
# No style prompt: the TTS model reads any instruction aloud as part of the text. The voice (TTS_VOICE) sets the tone.
MAX_CHARS = 800
CACHE_SIZE = 64
RATE_PER_MIN = 20

_cache: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()
_calls: deque = deque()
_lock = threading.Lock()


class TTSUnavailable(Exception):
    pass


def model() -> str:
    return config._env("TTS_MODEL") or DEFAULT_MODEL


def voice() -> str:
    return config._env("TTS_VOICE") or DEFAULT_VOICE


def timeout_s() -> float:
    try:
        return float(config._env("TTS_TIMEOUT_S", "15") or 15)
    except ValueError:
        return 15.0


def enabled() -> bool:
    if not config.llm_api_key():
        return False
    provider = config._env("TTS_PROVIDER").lower()
    return provider == "gemini" or (not provider and "generativelanguage.googleapis.com" in config.llm_base_url())


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Wrap raw 16-bit mono PCM (older Gemini TTS responses) in a WAV header so browsers can play it."""
    return (b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(pcm)) + pcm)


def _post(url: str, headers: dict, payload: dict, timeout: float) -> dict:
    r = httpx.post(url, headers=headers, json=payload, timeout=timeout)
    if r.status_code != 200:
        raise TTSUnavailable(f"tts http {r.status_code}")
    return r.json()


def _rate_ok() -> bool:
    now = time.monotonic()
    with _lock:
        while _calls and now - _calls[0] > 60:
            _calls.popleft()
        if len(_calls) >= RATE_PER_MIN:
            return False
        _calls.append(now)
        return True


def synthesize(text: str) -> tuple[bytes, str]:
    """Returns (audio bytes, mime type). Raises TTSUnavailable on any problem."""
    text = " ".join(text.split())[:MAX_CHARS]
    if not text:
        raise TTSUnavailable("empty text")
    if not enabled():
        raise TTSUnavailable("tts not configured")
    key = hashlib.sha256(f"{model()}|{voice()}|{text}".encode()).hexdigest()
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    if not _rate_ok():
        raise TTSUnavailable("tts rate limit")
    payload = {
        "contents": [{"parts": [{"text": text}]}],  # exactly what Nova displays, nothing else
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice()}}}},
    }
    url = f"{GEMINI_BASE}/models/{model()}:generateContent"
    try:
        data = _post(url, {"x-goog-api-key": config.llm_api_key(), "content-type": "application/json"}, payload, timeout_s())
        part = data["candidates"][0]["content"]["parts"][0]["inlineData"]
        audio, mime = base64.b64decode(part["data"]), part.get("mimeType", "")
    except TTSUnavailable:
        log.warning("tts failed: http error (model=%s)", model())
        raise
    except Exception as e:  # timeout, bad JSON, missing audio — never log the key or headers
        log.warning("tts failed: %s (model=%s)", type(e).__name__, model())
        raise TTSUnavailable(type(e).__name__) from e
    if "wav" not in mime:  # raw PCM (audio/L16;rate=24000)
        rate = 24000
        for bit in mime.split(";"):
            if bit.strip().startswith("rate="):
                rate = int(bit.split("=")[1])
        audio, mime = _pcm_to_wav(audio, rate), "audio/wav"
    with _lock:
        _cache[key] = (audio, "audio/wav")
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return audio, "audio/wav"
