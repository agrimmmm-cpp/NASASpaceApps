"""Trend tests M-1..M-7 from docs/03_DATA_CONTRACT.md section 5, plus determinism and safety rules."""
import pandas as pd
import pytest
from scipy.stats import spearmanr

import config
import mock_data


@pytest.fixture(scope="module")
def df():
    return mock_data.generate_mock()


def test_shape_and_uniqueness(df):
    assert len(df) == 400
    assert df["run_id"].is_unique
    assert list(df.columns) == mock_data.COLUMNS
    assert df["source_note"].str.startswith("[MOCK]").all()  # I-09
    assert df["spread_rate_mm_s"].notna().all() and (df["spread_rate_mm_s"] >= 0).all()


def test_composition(df):
    g = df["gravity_g"]
    assert abs((g == 0).mean() - 0.65) < 0.03
    assert abs((g == 1).mean() - 0.25) < 0.03
    assert abs(g.between(0.1, 0.5).mean() - 0.10) < 0.03
    assert {"BASS", "BASS-II", "FLEX", "FLEX-2", "Saffire", "ACME", "Ground"} == set(df["experiment"])


def test_deterministic():
    a, b = mock_data.generate_mock(), mock_data.generate_mock()
    pd.testing.assert_frame_equal(a, b)  # I-13


def test_M1_spread_rises_with_o2(df):
    p = df[(df.material == "PMMA") & (df.gravity_g == 0)]
    assert spearmanr(p.o2_percent, p.spread_rate_mm_s)[0] > 0.5


def test_M2_spread_rises_with_pressure(df):
    s = df[(df.gravity_g == 0)]
    assert spearmanr(s.pressure_kpa, s.spread_rate_mm_s)[0] > 0.2


def test_M3_blowoff_in_microgravity(df):
    s = df[(df.fuel_type == "solid") & (df.gravity_g == 0)]
    mean = s.groupby(pd.cut(s.airflow_cm_s, [0, 10, 20, 30, 40, 50.1], right=False), observed=True).spread_rate_mm_s.mean()
    peak = mean.idxmax()
    assert peak.left in (10.0, 20.0) or (peak.left == 10.0)         # peak bin inside 10-20 (allow neighbour 20-30)
    assert mean.iloc[-1] < 0.7 * mean.max()                          # >= 30% drop at 40-50 cm/s


def test_M3_peak_is_between_10_and_20(df):
    s = df[(df.fuel_type == "solid") & (df.gravity_g == 0)]
    mean = s.groupby(pd.cut(s.airflow_cm_s, [0, 10, 20, 30, 40, 50.1], right=False), observed=True).spread_rate_mm_s.mean()
    assert mean.idxmax().left == 10.0


def test_M4_starved_low_o2_flames_die(df):
    c = df[(df.gravity_g == 0) & (df.airflow_cm_s < 3)]
    low, high = c[c.o2_percent <= 21].extinguished, c[c.o2_percent >= 25].extinguished
    assert len(low) >= 8 and low.mean() >= 0.6
    assert low.mean() > high.mean()


def test_M5_microgravity_flames_cooler(df):
    t0, t1 = df[df.gravity_g == 0].flame_temp_k, df[df.gravity_g == 1].flame_temp_k
    assert t0.mean() < t1.mean() - 250
    assert 1150 < t0.median() < 1550 and 1750 < t1.median() < 2100


def test_M6_high_o2_rarely_extinguishes(df):
    assert df[df.o2_percent >= 30].extinguished.mean() <= 0.1


def test_refuses_to_overwrite_real_file(tmp_path, monkeypatch):
    real = tmp_path / "combustion_runs.csv"
    real.write_text("x")
    monkeypatch.setattr(config, "REAL_CSV", real)
    with pytest.raises(RuntimeError):
        mock_data.write_mock(tmp_path / "m.csv")             # real data present => nothing to mock
    with pytest.raises(RuntimeError):
        mock_data.write_mock(real, force=True)               # never write the real file (I-17)
