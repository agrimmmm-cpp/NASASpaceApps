# Fixtures

Example API responses matching `02_API_CONTRACT.md`. Both tracks test against these.

- Numbers are **illustrative, not model output** (the heatmap surface is a toy formula; vehicle values are placeholders). Do not treat them as science.
- `predict_edge_cases.json` is deliberately awkward: `shap: []`, `time_to_critical_s: null`, `ci_widened: true`, `matching_runs: 0`. The UI must render it cleanly.
- `runs.json` includes a row with nulls to exercise "—" rendering.
- Backend: every file must validate against its Pydantic model (contract test 1). Frontend: render every file in a dev fixture page.
- Changing a shape means updating the fixture in the same PR (see `00_START_HERE.md`).
