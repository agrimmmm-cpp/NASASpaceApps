# FIRE COMMAND: ZERO-G — Start Here

NASA Space Apps · "Flame in Freefall" track. A mission-control dashboard that predicts fire behaviour
in microgravity from NASA combustion-experiment data, explains it, and cites the source runs.

**Two people are building this in parallel. These docs exist so neither of you blocks or surprises the other.**
Read them in order. ~20 minutes total.

| # | Doc | What it is | Who must read |
|---|---|---|---|
| 00 | `00_START_HERE.md` | This file: rules of engagement | Both |
| 01 | `01_INVARIANTS.md` | Things that **must not change** without both people agreeing | Both |
| 02 | `02_API_CONTRACT.md` | Exact request/response shapes for every endpoint | Both |
| 03 | `03_DATA_CONTRACT.md` | CSV schema, loader rules, mock-data rules, real-data (PSI) mapping | Data/Backend; Frontend skim |
| 04 | `04_MODEL_SPEC.md` | Features, formulas, constants, SHAP, retrieval, CI | Backend; Frontend skim |
| 05 | `05_FRONTEND_CONTRACT.md` | Store shape, which input triggers which call, panel states, formatting, design tokens | Frontend; Backend skim |
| 06 | `06_TIER4_SPEC.md` | Command Mode + Material Passport (stretch) | Both, later |
| 07 | `07_RISKS.md` | What can go wrong, how we detect it, how we mitigate it | Both |
| 08 | `08_TASKS.md` | Task board split by track, with acceptance criteria | Both |
| — | `fixtures/*.json` | Example responses. Backend must produce them; frontend must render them | Both |

## Roles (swap names freely, keep the boundaries)

- **Track A — Data + Backend + ML**: owns `/data`, `/backend`, `docs/02`, `docs/03`, `docs/04`, `docs/fixtures`.
- **Track B — Frontend**: owns `/frontend`, `docs/05`, `frontend/src/types.ts`.
- **Track C — Content/Demo (whoever is free, can be either person)**: real NASA data acquisition, About-the-Data text,
  template insight wording, demo script, slides. See `08_TASKS.md`.
- Root files (`README.md`, `Makefile`, `.env.example`, `.gitignore`) are owned by Track A, edited by anyone via PR.

## Ground rules

1. **Contract first, code second.** If you need a field the contract doesn't have, change the contract *first*
   (see "Changing a contract" below), then code.
2. **Frontend never waits for the model.** Backend ships `STUB_MODE=1` early (Tier 1, day one): every endpoint
   returns the fixture-shaped data computed trivially. Frontend develops against stubs.
3. **Data source honesty.** If the badge says NASA DATA, every number came from the real CSV. Mock must never pass as real (see I-09).
4. **The demo must survive no wifi, no API key, and a missing model file.** Every external dependency has a fallback.
5. **Small PRs into `main`, rebase often.** Only one person edits a given directory (ownership above) unless the
   other person approves in chat.
6. **Don't expand scope** until the current tier's acceptance checklist in `08_TASKS.md` is fully green.

## Changing a contract

A contract change is one PR that touches **all** of these together, approved by the other person:

1. the relevant doc (`02`/`03`/`04`/`05`),
2. the matching fixture in `docs/fixtures/`,
3. `frontend/src/types.ts` **and** `backend/schemas.py` (Pydantic models),
4. a line in the changelog at the bottom of the doc.

Additive, optional fields are low-friction (ping the other person). Renames, removals, unit or meaning changes are "breaking":
agree in chat first, then merge both sides within the same hour so `main` is never half-migrated.

## Definition of "done" for the project

- `make dev` starts backend (8000) and frontend (5173) from a fresh clone, no manual steps beyond `cp .env.example .env`.
- Dashboard loads with zero API key, zero internet (except fonts bundled locally), mock data, shows MOCK DATA badge.
- Dropping a valid real CSV at `data/combustion_runs.csv` and restarting flips the badge to NASA DATA with no code change.
- Every panel has loading, error and empty states; killing the backend never blanks the page.
- The 3-minute demo script in `08_TASKS.md` runs end to end three times in a row.

## Changelog
- 2026-11-14 initial version.
