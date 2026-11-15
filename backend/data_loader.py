"""Schema-driven CSV loader (docs/03_DATA_CONTRACT.md section 2).

Rules:
  * data/combustion_runs.csv exists -> validate it, data_source="nasa". Invalid => DataError (startup failure). NEVER fall back to mock (I-17).
  * otherwise generate (if absent) and load data/mock_combustion_runs.csv, data_source="mock".
Run `python data_loader.py --validate path.csv` to check a file and print the report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

import config

log = logging.getLogger("fire.data")

BAD_TYPE_FATAL_FRACTION = 0.05
_TRUE = {"true", "1", "t", "yes"}
_FALSE = {"false", "0", "f", "no"}


class DataError(Exception):
    """Fatal data problem. Message is written for a human (it is printed at startup)."""


@dataclass
class Dataset:
    df: pd.DataFrame
    source: str  # "mock" | "nasa"
    path: Path
    sha256: str
    report: dict = field(default_factory=dict)

    @property
    def n_runs(self) -> int:
        return len(self.df)


def load_schema(path: Path = config.SCHEMA_JSON) -> dict:
    return json.loads(Path(path).read_text())


def load_vocab(path: Path = config.VOCAB_JSON) -> dict[str, dict]:
    return {m["id"]: m for m in json.loads(Path(path).read_text())["materials"]}


def _parse_bool_cell(v: str) -> Any:
    s = v.strip().lower()
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    return None


def _parse_column(raw: pd.Series, col: dict) -> tuple[pd.Series, int, int]:
    """Return (parsed, n_nonempty, n_unparsable). Empty cells -> null. Unparsable -> null (counted)."""
    s = raw.astype(str).str.strip()
    empty = s == ""
    kind = col["type"]
    if kind == "string":
        out = s.where(~empty, None).astype(object)
        return out, int((~empty).sum()), 0
    if kind == "float":
        num = pd.to_numeric(s.where(~empty, None), errors="coerce")
        num = num.where(np.isfinite(num), np.nan)
        bad = int((num.isna() & ~empty).sum())
        return num.astype("float64"), int((~empty).sum()), bad
    if kind == "bool":
        vals = [None if e else _parse_bool_cell(v) for v, e in zip(s.tolist(), empty.tolist())]
        out = pd.Series(vals, index=s.index, dtype="boolean")
        bad = int((out.isna() & ~empty).sum())
        return out, int((~empty).sum()), bad
    raise DataError(f"schema.json: unknown column type '{kind}' for {col['name']}")


def load_csv(path: Path, source: str, schema: Optional[dict] = None,
             vocab: Optional[dict] = None, report_path: Optional[Path] = config.DATA_REPORT_JSON) -> Dataset:
    path = Path(path)
    schema = schema or load_schema()
    vocab = vocab if vocab is not None else load_vocab()
    cols = schema["columns"]
    names = [c["name"] for c in cols]

    raw_bytes = path.read_bytes()
    digest = hashlib.sha256(raw_bytes).hexdigest()
    try:
        raw = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8")
    except Exception as e:  # unreadable / empty file
        raise DataError(f"{path}: cannot read CSV ({e})") from e

    missing = [n for n in names if n not in raw.columns]
    if missing:
        raise DataError(f"{path}: missing required columns {missing}. Expected header: {names}")
    extra = [c for c in raw.columns if c not in names]
    warnings: list[str] = []
    if extra:
        warnings.append(f"ignored extra columns: {extra}")
    raw = raw[names]
    n_read = len(raw)
    if n_read == 0:
        raise DataError(f"{path}: file has a header but zero rows")

    parsed: dict[str, pd.Series] = {}
    for c in cols:
        series, n_nonempty, n_bad = _parse_column(raw[c["name"]], c)
        if n_nonempty and n_bad / n_nonempty > BAD_TYPE_FATAL_FRACTION:
            raise DataError(f"{path}: column '{c['name']}' has {n_bad} of {n_nonempty} values that are not valid "
                            f"{c['type']} (>{int(BAD_TYPE_FATAL_FRACTION * 100)}%). Check units/format.")
        if n_bad:
            warnings.append(f"column '{c['name']}': {n_bad} unparsable value(s) treated as empty")
        parsed[c["name"]] = series
    df = pd.DataFrame(parsed)

    dup = df["run_id"].dropna()
    dups = dup[dup.duplicated(keep=False)].unique().tolist()
    if dups:
        raise DataError(f"{path}: duplicate run_id values (first 5): {dups[:5]}")

    # ---- row-level policy: drop rows violating a hard rule; remember the first reason ----
    reason = pd.Series([None] * len(df), index=df.index, dtype=object)

    def mark(mask: pd.Series, why: str) -> None:
        mask = mask.fillna(False) & reason.isna()
        reason.loc[mask] = why

    for c in cols:
        n = c["name"]
        s = df[n]
        if not c.get("nullable", True):
            mark(s.isna(), f"missing_{n}")
        if "allowed" in c:
            mark(s.notna() & ~s.isin(c["allowed"]), f"bad_{n}")
        if c["type"] == "float":
            if "min" in c:
                mark(s.notna() & (s < c["min"]), f"out_of_range_{n}")
            if "max" in c:
                mark(s.notna() & (s > c["max"]), f"out_of_range_{n}")
        if "soft_allowed" in c:
            unknown = sorted(set(s.dropna()) - set(c["soft_allowed"]))
            if unknown:
                warnings.append(f"column '{n}': values outside the known list {unknown} (kept)")

    dropped_mask = reason.notna()
    dropped = Counter(reason[dropped_mask].tolist())
    first_reasons = [{"run_id": df.loc[i, "run_id"], "reason": reason[i]} for i in reason[dropped_mask].index[:10]]
    for fr in first_reasons:
        log.warning("dropped row %s: %s", fr["run_id"], fr["reason"])
    kept = df.loc[~dropped_mask].reset_index(drop=True)
    if kept.empty:
        raise DataError(f"{path}: zero valid rows after validation. Dropped by reason: {dict(dropped)}")

    unknown_mats = sorted(set(kept["material"]) - set(vocab))
    if unknown_mats:
        warnings.append(f"materials not in data/vocab.json (shown in Explorer, excluded from training): {unknown_mats}")

    report = {
        "file": str(path), "data_source": source, "sha256": digest,
        "rows_read": n_read, "rows_kept": int(len(kept)),
        "rows_dropped": dict(dropped), "first_dropped": first_reasons,
        "null_counts": {n: int(kept[n].isna().sum()) for n in names},
        "materials": sorted(set(kept["material"])), "experiments": sorted(set(kept["experiment"])),
        "unknown_materials": unknown_mats,
        "gravity_values": {str(k): int(v) for k, v in kept["gravity_g"].round(2).value_counts().sort_index().items()},
        "usable_for_training": {
            "spread": int(kept["spread_rate_mm_s"].notna().sum()),
            "temp": int(kept["flame_temp_k"].notna().sum()),
            "extinction": int(kept["extinguished"].notna().sum()),
        },
        "extinguished_rate": (None if kept["extinguished"].notna().sum() == 0
                              else round(float(kept["extinguished"].dropna().astype(float).mean()), 3)),
        "warnings": warnings,
    }
    if report_path:
        try:
            Path(report_path).write_text(json.dumps(report, indent=2))
        except OSError:  # report is a convenience, never fatal
            log.warning("could not write %s", report_path)
    return Dataset(df=kept, source=source, path=path, sha256=digest, report=report)


def load_dataset(real_csv: Optional[Path] = None, mock_csv: Optional[Path] = None,
                 report_path: Optional[Path] = config.DATA_REPORT_JSON) -> Dataset:
    real_csv = Path(real_csv) if real_csv else config.REAL_CSV     # resolved at call time (tests / tools may re-point config)
    mock_csv = Path(mock_csv) if mock_csv else config.MOCK_CSV
    if Path(real_csv).exists():
        log.info("loading real data %s", real_csv)
        return load_csv(real_csv, "nasa", report_path=report_path)  # DataError propagates: no silent mock fallback (I-17)
    if not Path(mock_csv).exists():
        from mock_data import write_mock

        log.info("no real data; generating mock at %s", mock_csv)
        write_mock(mock_csv)
    return load_csv(mock_csv, "mock", report_path=report_path)


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> JSON-safe dicts (NaN/NA -> None)."""
    obj = df.astype(object).where(df.notna(), None)
    return obj.to_dict("records")


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate a combustion-runs CSV against data/schema.json")
    ap.add_argument("--validate", required=True, type=Path)
    ap.add_argument("--source", default="nasa", choices=["nasa", "mock"])
    a = ap.parse_args()
    try:
        ds = load_csv(a.validate, a.source)
    except DataError as e:
        print(f"INVALID: {e}", file=sys.stderr)
        return 1
    print(json.dumps(ds.report, indent=2))
    print(f"\nOK: {ds.report['rows_kept']}/{ds.report['rows_read']} rows kept. Full report: {config.DATA_REPORT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
