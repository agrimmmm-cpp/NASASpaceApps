import pandas as pd
import pytest

import mock_data
from data_loader import DataError, load_csv, load_dataset


@pytest.fixture()
def good(tmp_path):
    df = mock_data.generate_mock().head(40)
    p = tmp_path / "real.csv"
    df.to_csv(p, index=False)
    return p, df


def test_valid_file_loads(good, tmp_path):
    p, df = good
    ds = load_csv(p, "nasa", report_path=tmp_path / "r.json")
    assert ds.source == "nasa" and len(ds.df) == 40
    assert ds.report["rows_dropped"] == {}


def test_missing_column_is_fatal(good, tmp_path):
    p, df = good
    df.drop(columns=["o2_percent"]).to_csv(p, index=False)
    with pytest.raises(DataError, match="o2_percent"):
        load_csv(p, "nasa", report_path=None)


def test_duplicate_run_id_is_fatal(good):
    p, df = good
    pd.concat([df, df.head(1)]).to_csv(p, index=False)
    with pytest.raises(DataError, match="duplicate"):
        load_csv(p, "nasa", report_path=None)


def test_out_of_range_rows_dropped_not_clamped(good):
    p, df = good
    df.loc[0, "o2_percent"] = 0.21          # classic fraction-vs-percent unit mistake (R-04)
    df.loc[1, "spread_rate_mm_s"] = -3
    df.to_csv(p, index=False)
    ds = load_csv(p, "nasa", report_path=None)
    assert len(ds.df) == 38
    assert ds.report["rows_dropped"] == {"out_of_range_o2_percent": 1, "out_of_range_spread_rate_mm_s": 1}


def test_nulls_kept_for_nullable_columns(good):
    p, df = good
    df = df.astype(object)
    df.loc[2, ["spread_rate_mm_s", "flame_temp_k", "extinguished"]] = None
    df.to_csv(p, index=False)
    ds = load_csv(p, "nasa", report_path=None)
    assert len(ds.df) == 40 and ds.df["spread_rate_mm_s"].isna().sum() == 1


def test_mostly_garbage_column_is_fatal(good):
    p, df = good
    df["airflow_cm_s"] = "fast"
    df.to_csv(p, index=False)
    with pytest.raises(DataError, match="airflow_cm_s"):
        load_csv(p, "nasa", report_path=None)


def test_no_real_file_uses_mock(tmp_path):
    ds = load_dataset(real_csv=tmp_path / "nope.csv", mock_csv=tmp_path / "mock.csv", report_path=None)
    assert ds.source == "mock" and (tmp_path / "mock.csv").exists() and len(ds.df) == 400


def test_invalid_real_file_never_falls_back_to_mock(tmp_path):
    bad = tmp_path / "real.csv"
    bad.write_text("run_id,experiment\nA,BASS\n")
    with pytest.raises(DataError):
        load_dataset(real_csv=bad, mock_csv=tmp_path / "mock.csv", report_path=None)  # I-17
    assert not (tmp_path / "mock.csv").exists()
