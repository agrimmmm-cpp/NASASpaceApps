# Deploy + submit (due tonight)

## 0. Push first
```
git add frontend render.yaml docs/DEPLOY_AND_SUBMIT.md
git commit -m "Investigation Explorer, CSV export, deploy config"
git push
```
`data/combustion_runs.csv` stays untracked — the server copies the identical, committed `data/candidate/combustion_runs.csv` at build time.

## 1. Backend on Render (~10 min, free)
1. render.com → sign in with GitHub → **New → Blueprint** → pick the repo. It reads `render.yaml`.
2. When asked for env vars, paste the values from your local `.env`: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`. (Never commit them.)
3. Deploy. First build ~5 min; the model trains on start (~1 min). Check `https://fire-command-api.onrender.com/api/health` → `"model_ready": true`, `"data_source": "nasa"`.
4. If Render gives the service a **different URL**, put it in `frontend/vercel.json` (`destination`) and push.

Free tier sleeps after ~15 min idle; the first visit then takes 30–60 s. **Open the site 2 minutes before judging / recording.**

## 2. Frontend on Vercel (~5 min, free)
1. vercel.com → sign in with GitHub → **Add New → Project** → pick the repo.
2. **Root Directory: `frontend`** (important). Framework: Vite (auto). Deploy.
3. Open the Vercel URL: the badge should say NASA DATA. `/api/*` is forwarded to Render by `frontend/vercel.json`, so no CORS setup is needed.

## 3. Demo video script (~60–90 s; trim to the length the submission form asks for)
1. **Hook (5 s)** — Hero, spin the Earth: "Fire in space doesn't rise — it becomes a blue sphere. We turned 190 real NASA ISS fire experiments into a fire-safety dashboard."
2. **Gravity (8 s)** — drag the gravity slider Earth → microgravity, the flame morphs.
3. **Prediction + honesty (12 s)** — Risk dial; scroll to "How sure are we?" → Low → **Jump to real data** → confidence rises. "It tells you when it's guessing."
4. **Danger map (8 s)** — the plain verdict + "Try the safer option".
5. **Investigation Explorer (15 s)** — pick **Lunar Habitat**: high-O₂ and partial-gravity research jumps to the top; filter Detection; compare two; **Ask Nova** → grounded answer citing FLEX runs; Download CSV.
6. **Command Mode (15 s)** — IGNITE, grab the extinguisher, knock the fire down; show it spreading if you wait.
7. **Close (5 s)** — "Built on NASA PSI data: FLEX and Saffire-II. Research and education tool — not operational guidance."

## 4. Submission write-up (paste into the form; edit the team names)

**Project name:** Fire Command: Zero-G

**One-line summary:** An AI-powered mission-control dashboard that turns NASA's microgravity combustion experiments into clear, honest fire-safety insights for spacecraft, stations and Moon/Mars habitats.

**What it does**
- **Summarizes and ranks NASA combustion investigations** (BASS, Saffire, SAME, FLEX, FLEX-2, CFI, ACME's BRE / CFI-G / E-FIELD, SPICE, SLICE) by relevance to a chosen habitat (ISS, Gateway, Lunar Habitat, Mars Transit) and by fire-safety role: prevention, detection, suppression. Side-by-side comparison, AI summaries, Earth spin-offs.
- **Predicts fire behaviour** for any cabin condition (oxygen, pressure, airflow, gravity) with a machine-learning model trained on 190 real runs from NASA PSI (FLEX: 182 heptane/methanol droplet runs; Saffire-II: 8 large-scale material fires): burning rate with a likely range, chance the flame keeps burning, a risk index, and a danger map across oxygen × airflow.
- **Interprets** every prediction in plain language (what drives the risk, a safer nearby option), cites the exact NASA runs behind it, and shows **how sure it is** (nearby real runs, range width, held-out model accuracy), with a jump to the closest real experiment.
- **Extracts data** for further modeling: CSV download of the runs behind the model.
- **Command Mode:** a first-person, real-time fire emergency in a 3D station module where flame growth comes from the model — a training/outreach tool that makes the physics tangible.

**Use of AI**
- Gradient-boosting models (scikit-learn) with SHAP explanations, trained on NASA PSI data.
- An LLM (Google Gemini) writes insights and answers questions **grounded in retrieved NASA runs, with run IDs cited**; template fallbacks keep the app working without it. Gemini text-to-speech gives the assistant a voice.
- AI coding assistants were used during development. *(Adjust to match the challenge's AI-disclosure rules.)*

**NASA data**
- PSI-69 — FLEX, Flame Extinguishment Experiment (doi:10.60555/mbq8-0451)
- PSI-99 — Saffire-II, Spacecraft Fire Safety Demonstration (doi:10.60555/2chp-m469)
- NASA NTRS: Methanol droplet extinction in microgravity (20120016855)
- Investigation descriptions: 2026 Space Apps "Flame in Freefall" challenge statement. Images: NASA (see frontend/src/assets/nasa/CREDITS.md).

**Honest limits**
- PSI has no partial-gravity combustion data; Moon/Mars values are interpolated between microgravity and Earth and are labelled as such (wider ranges).
- The model's held-out accuracy is modest (spread R² ≈ 0.22, extinction AUC ≈ 0.61) — the dashboard shows this instead of hiding it.
- Command Mode's spreading/extinguisher/scoring are game rules, clearly labelled.
- Research and education tool, not operational fire-safety guidance.

**Benefits / audience:** students, researchers and engineers get one place to find, compare and interpret NASA fire-safety research for a specific habitat, plus a model they can probe and data they can download.
