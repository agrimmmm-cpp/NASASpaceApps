import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["STUB_MODE"] = "1"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


SCENARIO = {"material": "PMMA", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 10.0, "gravity_g": 0.0}
