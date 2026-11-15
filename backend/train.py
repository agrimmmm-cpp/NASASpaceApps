"""Train the model on the active dataset (real CSV if present, else mock) and cache it.  `make train`

    python train.py [--force]      # --force ignores the cached artifact and retrains
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

import model
import services
from pathlib import Path

from data_loader import DataError, load_csv, load_dataset

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--data", type=Path, help="train on this CSV (treated as real data) instead of the active dataset")
    a = ap.parse_args()
    try:
        ds = load_csv(a.data, "nasa", report_path=None) if a.data else load_dataset()
        materials = [m["id"] for m in services.build_materials(ds.df)]
        pred = model.load_or_train(ds, materials, force=a.force)
    except DataError as e:
        print(f"DATA ERROR: {e}", file=sys.stderr)
        return 1
    print(json.dumps({"data_source": ds.source, "rows": ds.n_runs, "version": pred.version,
                      "predictable_materials": [m for m in materials], "spread_ref_mm_s": round(pred.spread_ref, 3),
                      "metrics": pred.metrics, "capabilities": pred.capabilities}, indent=2))
    if ds.source == "mock":
        print("\nNOTE: trained on MOCK data. Metrics mostly show how well the model recovers the mock generator, not physics (R-03).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
