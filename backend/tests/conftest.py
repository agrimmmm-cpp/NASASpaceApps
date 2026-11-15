import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SCENARIO = {"material": "PMMA", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 10.0, "gravity_g": 0.0}


def _wait_ready(c, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if c.get("/api/health").json()["model_ready"]:
            return
        time.sleep(0.25)
    raise RuntimeError("model did not become ready")


@pytest.fixture(scope="session", params=["stub", "real"])
def client(request):
    """Every contract test runs against BOTH predictors: the stub and the trained model (docs/02 'Contract tests')."""
    from fastapi.testclient import TestClient

    import main

    os.environ["STUB_MODE"] = "1" if request.param == "stub" else "0"
    with TestClient(main.app) as c:
        _wait_ready(c)
        c.mode = request.param
        yield c


@pytest.fixture(autouse=True)
def _hermetic_llm(monkeypatch):
    """No test may touch the network or a real key: LLM is off unless a test turns it on with a fake transport."""
    import llm

    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_MODEL", "")
    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_TIMEOUT_S", "8")

    def _forbidden(*a, **k):
        raise AssertionError("real network call attempted in a test")

    monkeypatch.setattr(llm, "_post", _forbidden)
    llm.reset_state()
    yield
    llm.reset_state()
