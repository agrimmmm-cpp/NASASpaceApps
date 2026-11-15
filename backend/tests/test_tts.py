"""POST /api/tts (Gemini text-to-speech for Nova). No network: Gemini is faked by patching tts._post."""
import base64
import logging

import pytest

import tts

WAV = b"RIFF" + b"\x00" * 40  # any bytes; the endpoint passes WAV through untouched
SECRET = "test-key-should-never-appear"


@pytest.fixture
def gemini_on(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", SECRET)
    monkeypatch.setenv("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
    tts._cache.clear()
    tts._calls.clear()
    calls = []

    def fake_post(url, headers, payload, timeout):
        calls.append((url, headers, payload))
        return {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(WAV).decode()}}]}}]}

    monkeypatch.setattr(tts, "_post", fake_post)
    return calls


def test_disabled_without_key_is_503_envelope(client):
    r = client.post("/api/tts", json={"text": "Hello"})            # conftest turns the LLM key off
    assert r.status_code == 503 and r.json()["error"]["code"] == "INTERNAL"


@pytest.mark.parametrize("body", [{"text": ""}, {"text": "x" * 801}, {}])
def test_bad_text_is_422(client, body):
    r = client.post("/api/tts", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_returns_wav_and_uses_header_auth(client, gemini_on):
    r = client.post("/api/tts", json={"text": "Flames turn blue in microgravity."})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.content == WAV
    url, headers, payload = gemini_on[0]
    assert url.endswith(f"models/{tts.model()}:generateContent") and SECRET not in url     # key in a header, never the URL
    assert headers["x-goog-api-key"] == SECRET
    assert payload["generationConfig"]["responseModalities"] == ["AUDIO"]


def test_same_text_is_cached(client, gemini_on):
    for _ in range(3):
        assert client.post("/api/tts", json={"text": "Same line"}).status_code == 200
    assert len(gemini_on) == 1


def test_raw_pcm_is_wrapped_as_wav(client, monkeypatch, gemini_on):
    pcm = b"\x01\x00" * 100
    monkeypatch.setattr(tts, "_post", lambda *a, **k: {"candidates": [{"content": {"parts": [
        {"inlineData": {"mimeType": "audio/L16;codec=pcm;rate=24000", "data": base64.b64encode(pcm).decode()}}]}}]})
    r = client.post("/api/tts", json={"text": "pcm please"})
    assert r.status_code == 200 and r.content[:4] == b"RIFF" and r.content[8:12] == b"WAVE" and r.content.endswith(pcm)


def test_gemini_failure_is_503_and_key_not_logged(client, monkeypatch, gemini_on, caplog):
    def boom(*a, **k):
        raise tts.TTSUnavailable("tts http 500")
    monkeypatch.setattr(tts, "_post", boom)
    with caplog.at_level(logging.DEBUG):
        r = client.post("/api/tts", json={"text": "will fail"})
    assert r.status_code == 503
    assert SECRET not in caplog.text


def test_rate_limit_falls_back(client, monkeypatch, gemini_on):
    monkeypatch.setattr(tts, "RATE_PER_MIN", 2)
    codes = [client.post("/api/tts", json={"text": f"line {i}"}).status_code for i in range(4)]
    assert codes == [200, 200, 503, 503]
