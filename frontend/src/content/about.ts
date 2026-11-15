// About-the-Data copy (05 §10). Track C owns this wording — edit freely here; the modal layout lives in
// components/AboutModal.tsx. Numbers (run counts, model scores, materials) are NOT written here: the modal
// fills them in from /api/meta so the text can never drift from the data that's actually loaded.
// Facts below follow data/SOURCES.md and docs/07_RISKS.md (R-05, R-38..R-40).

export const ABOUT_TITLE = "About the data";

export const WHY_MICROGRAVITY = {
  heading: "Why flames behave differently in space",
  paras: [
    "On Earth, a flame heats the air around it. Hot gas is lighter, so it rises — and that upward draft pulls fresh, oxygen-rich air in from below. That's why a candle flame is a tall, flickering teardrop.",
    "In microgravity nothing is “lighter”, so nothing rises. The hot exhaust stays wrapped around the flame and fresh oxygen only creeps in by diffusion. Flames turn into dim, blue, roughly spherical balls: cooler, with less soot, and sometimes smothered by their own exhaust.",
    "That's also why airflow matters so much on a spacecraft: a gentle ventilation breeze can feed a flame that would otherwise starve, while a strong one can blow it out.",
  ],
};

/** Plain-language descriptions, keyed by the experiment names that can appear in /api/meta.experiments. */
export const EXPERIMENTS: Record<string, { name: string; where: string; what: string }> = {
  FLEX: {
    name: "FLEX — Flame Extinguishment Experiment",
    where: "International Space Station, Combustion Integrated Rack",
    what: "Burned single free-floating fuel droplets a few millimetres across (heptane, methanol and others) in different gas mixtures, to learn when and how flames go out — useful for choosing fire suppressants. The measurement here is the droplet's burning-rate constant: how fast its surface area shrinks.",
  },
  "FLEX-2": {
    name: "FLEX-2",
    where: "International Space Station",
    what: "Follow-on droplet experiment studying fuel mixtures and droplet arrays.",
  },
  Saffire: {
    name: "Saffire — Spacecraft Fire Safety Experiment",
    where: "Uncrewed Cygnus cargo vehicles, after leaving the ISS",
    what: "The largest fires ever lit in space, set deliberately inside empty cargo ships before they re-entered the atmosphere, to see how real spacecraft materials (fabric, acrylic, silicone) burn at full scale. Saffire-II ran with a cabin of 22.1% oxygen at 100.6 kPa.",
  },
  BASS: {
    name: "BASS — Burning and Suppression of Solids",
    where: "International Space Station",
    what: "Small samples of solid materials burned in a flow tunnel, to see how airflow and oxygen control flame spread and extinction.",
  },
  "BASS-II": {
    name: "BASS-II",
    where: "International Space Station",
    what: "Second series of BASS solid-fuel burns with more materials and flow settings.",
  },
  ACME: {
    name: "ACME — Advanced Combustion via Microgravity Experiments",
    where: "International Space Station",
    what: "Gas-jet flames used to study soot, flame shape and extinction without buoyancy.",
  },
  Ground: {
    name: "Ground (1 g reference)",
    where: "Earth laboratories",
    what: "Normal-gravity runs used as the comparison point for the space experiments.",
  },
};

export const SOURCES = [
  { label: "PSI-69 · FLEX experimental table", doi: "10.60555/mbq8-0451", url: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-69" },
  { label: "PSI-99 · Saffire-II experimental table", doi: "10.60555/2chp-m469", url: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-99" },
];
export const SOURCES_NOTE = "NASA Physical Sciences Informatics (PSI) repository. Both tables are public domain (CC0-1.0); retrieved 15 Nov 2026.";

export const MODEL_TEXT =
  "Gradient-boosted decision trees (scikit-learn) trained on the loaded runs. Inputs: material, oxygen, pressure, airflow and gravity. Outputs: the spread or burning rate with a likely range, the chance the flame goes out, and flame temperature when the data has it.";

export const SCORE_HELP = {
  r2: "How much of the run-to-run variation in the rate the model explains (0 = none, 1 = all).",
  auc: "How well it tells flames that go out from flames that keep burning (0.5 = coin flip, 1 = perfect).",
};

export const RISK_HELP = "The risk index is a relative score for comparing scenarios — not the probability of a fire or of losing a spacecraft.";

/** Limitations that always apply. Data-dependent ones are added by the modal from /api/meta. */
export const ALWAYS_LIMITS = [
  "Small, uneven datasets: a few hundred runs at most, clustered around the conditions the experiments happened to test.",
  "Different fuel types measure different things, so they're never compared on one scale.",
  "Research and education demo — not operational fire-safety guidance.",
];
