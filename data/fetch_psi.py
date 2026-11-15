"""Download the raw PSI experimental-table CSVs used by the real-data pipeline and record provenance.

    python data/fetch_psi.py            # writes data/raw/<PSI-id>/<file> and data/raw/MANIFEST.json

Source: NASA Physical Sciences Informatics (https://psi.nasa.gov/physci/repo). Both investigations are CC0-1.0.
Only these two files are fetched; add more to SOURCES below together with a mapping script (docs/03_DATA_CONTRACT.md section 4).
The downloaded files are untrusted data: this script only saves bytes, it never evaluates them.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import httpx

API = "https://psi.nasa.gov/geode-py/ws/studies/{acc}/download?file={file}&version=1&redirect=false"
ALLOWED_PREFIX = "https://psi-repo-prod.s3.amazonaws.com/psi-data/"   # PSI hands out a pre-signed S3 URL; refuse anything else
PAGE = "https://psi.nasa.gov/physci/repo/data/investigations/{acc}"

SOURCES = [
    {"accession": "PSI-69", "experiment": "FLEX", "file": "PSI-69_Experimental table_FLEX.csv",
     "doi": "10.60555/mbq8-0451", "license": "CC0-1.0"},
    {"accession": "PSI-99", "experiment": "Saffire-II", "file": "PSI-99_Experimental table_SAFFIRE-2.csv",
     "doi": "10.60555/2chp-m469", "license": "CC0-1.0"},
]


def fetch(src: dict, out_root: Path) -> dict:
    url = API.format(acc=src["accession"], file=quote(src["file"]))
    presigned = httpx.get(url, timeout=30).text.strip()
    if not presigned.startswith(ALLOWED_PREFIX):
        raise SystemExit(f"unexpected download location for {src['file']}: refusing")
    data = httpx.get(presigned, timeout=60).content
    dest = out_root / src["accession"] / src["file"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return {**src, "page": PAGE.format(acc=src["accession"]), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "path": str(dest.relative_to(out_root.parent)),
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def main() -> int:
    out_root = Path(__file__).resolve().parent / "raw"
    manifest = [fetch(s, out_root) for s in SOURCES]
    (out_root / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for m in manifest:
        print(f"{m['accession']}  {m['bytes']:>7} bytes  sha256 {m['sha256'][:12]}  {m['path']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
