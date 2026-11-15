# Data sources (real NASA data)

Everything in `data/candidate/combustion_runs.csv` comes from the NASA Physical Sciences Informatics (PSI) repository,
https://psi.nasa.gov/physci/repo. Both investigations are **CC0-1.0** (public domain). Retrieval date and file hashes are in
`data/raw/MANIFEST.json` (the raw files are committed so the pipeline is reproducible offline).

| Accession | Experiment | DOI | Raw file | Rows read | Rows used |
|---|---|---|---|---|---|
| [PSI-69](https://psi.nasa.gov/physci/repo/data/investigations/PSI-69) | FLEX (Flame Extinguishment Experiment, droplets on the ISS) | 10.60555/mbq8-0451 | `PSI-69_Experimental table_FLEX.csv` | 274 | 182 (methanol 102, heptane 80) |
| [PSI-99](https://psi.nasa.gov/physci/repo/data/investigations/PSI-99) | Saffire-II (large-scale fires in the Cygnus vehicle) | 10.60555/2chp-m469 | `PSI-99_Experimental table_SAFFIRE-2.csv` | 9 | 8 (silicone 4, SIBAL 2, PMMA 2) |

Reproduce: `make real-data` (fetch, map, validate). Result: `data/candidate/combustion_runs.csv` + `mapping_report.json`.
The candidate is **not active** until you run `make promote-real` (copies it to `data/combustion_runs.csv`).

## Verification of two facts the PSI tables do not state

- FLEX "Burning rate" is in **mm²/s** (the PSI column header only says "mm"): confirmed in NASA NTRS 20120016855,
  "Methanol Droplet Extinction in Oxygen/Carbon dioxide/Nitrogen Mixtures in Microgravity" (https://ntrs.nasa.gov/api/citations/20120016855/downloads/20120016855.pdf).
- Saffire-II cabin atmosphere at hatch closure was **22.1% O2, 100.6 kPa**: Olson et al. 2019, "Concurrent Flame Spread Over
  Two-Sided Thick PMMA Slabs in Microgravity", Fire Technology, doi:10.1007/s10694-019-00863-3. The PSI table has no pressure column.

## Assumptions and what is NOT in the data

Full list in `mapping_report.json` (`assumptions`). The important ones:

- **All rows are 0 g.** No 1 g or partial-g rows, so the model cannot learn a gravity effect (`capabilities.gravity_effect = false`).
- **No flame temperature anywhere** (`capabilities.flame_temp = false`): `flame_temp_k` is empty, the API returns `null`.
- **FLEX airflow is recorded as 0 cm/s** (free droplets in a still chamber; the table does not record the small flows used in some tests).
- **FLEX `spread_rate_mm_s` is the droplet burning-rate constant in mm²/s**, a different quantity from the solid-fuel flame-spread rate in mm/s. `fuel_type` separates them; do not compare across fuel types (R-05).
- **FLEX outcome:** Extinction -> `extinguished=true`, Completion -> `false`, Disruption -> empty. 90% of known outcomes are "extinguished".
- Rows outside our input ranges are rejected, not clamped: 76 FLEX tests above 101.3 kPa (the experiment ran up to ~3 atm), 15 below 15% O2, 1 with no pressure.
  One documented exception: measured pressures of 101.3-102.0 kPa (within 0.7% of 1 atm) are recorded as 101.3 and the measured value stays in `source_note`.
- Materials with fewer than 10 rows (silicone, SIBAL, PMMA here) stay visible in the Explorer and citations but cannot be selected for prediction.
- Saffire-II 1 g columns are not used (their test conditions are not stated). Sample 2-7 (PMMA and Nomex on one card) is rejected.

## Investigations checked and not used

| Accession | Why not |
|---|---|
| PSI-25 BASS-II (129 tests), PSI-26 BASS (122) | Tables list material and O2 (BASS-II) but no spread rate or outcome; fan settings are not airflow in cm/s. The measurements are in raw video and the papers. |
| PSI-98 Saffire-I (4), PSI-100 Saffire-III (2) | No O2, spread rate or outcome in the table. |
| PSI-68 FLEX-2 | 8 parameter ranges, not individual runs. |
| PSI-20/21/22/23/10/159 ACME | Gas flames: soot, burner and cool-flame studies; no flame-spread metric. |

## Possible next sources (not done)

Spread rates for solids and 1 g comparisons exist in papers, e.g. Urban et al. 2019, "Flame spread: Effects of microgravity and scale",
doi:10.1016/j.combustflame.2018.10.012. Extracting them means transcribing tables by hand: add a mapping function and a row in
`data/fetch_psi.py`-style provenance, keep `source_note` citing the table, and never fill gaps.
