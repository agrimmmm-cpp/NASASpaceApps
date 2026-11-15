// NASA PSI combustion investigations for the Investigation Explorer.
// SOURCES (nothing else): the official 2026 Space Apps "Flame in Freefall" challenge statement
// (spaceappschallenge.org/2026/challenges/flame-in-freefall — Background + Potential Considerations) and
// data/SOURCES.md (which investigations feed this app's model). Track A/C: please review before the demo.
// Tags drive the habitat ranking in lib/rankInvestigations.ts; they only restate what the statement says.

export type Pillar = "prevention" | "detection" | "suppression";
export type FuelKind = "solid" | "liquid droplet" | "gas";

export interface Investigation {
  id: string;
  name: string;
  full: string;
  project?: string;
  pillars: Pillar[];
  fuels: FuelKind[];
  hardware: string;
  studied: string;
  tags: { flammability?: boolean; highO2?: boolean; airflow?: boolean; partialG?: boolean; detection?: boolean; suppression?: boolean };
  /** fuel sample shape/size — only where verified (raw PSI tables in data/raw/, or the PSI record) */
  sample?: string;
  /** measurements / sensors — only where verified */
  sensors?: string;
  /** PSI accession pages (data/SOURCES.md) */
  psi?: { id: string; label: string }[];
  /** why this app's model doesn't train on it (data/SOURCES.md, "Investigations checked and not used") */
  notModeled?: string;
  /** fire-safety equipment / controls this research informs (prevention → materials, detection → detectors, suppression → extinguishing) */
  informs?: string;
  /** experiment name in /api/runs when this app's model is trained on it */
  inApp?: string;
  dataset?: string;
}

export const INVESTIGATIONS: Investigation[] = [
  {
    id: "bass", name: "BASS & BASS-II", full: "Burning and Suppression of Solids", pillars: ["prevention", "suppression"], fuels: ["solid", "gas"],
    hardware: "Microgravity Science Glovebox (MSG), modular fan-driven flow duct",
    studied: "Flammability of solid materials such as fabrics and plastics, with a controlled air flow.",
    informs: "Choosing cabin materials and knowing their flammability limits; putting out fires on solid materials.",
    psi: [{ id: "PSI-26", label: "BASS" }, { id: "PSI-25", label: "BASS-II" }],
    notModeled: "Checked: 122 BASS and 129 BASS-II tests, but the tables have no spread rate or outcome (those are in raw video and papers), and fan settings aren't airflow in cm/s.",
    tags: { flammability: true, airflow: true, suppression: true },
  },
  {
    id: "saffire", name: "Saffire-I, -II, -III", full: "Spacecraft Fire Safety Demonstration", pillars: ["prevention"], fuels: ["solid"],
    hardware: "Inside uncrewed Cygnus cargo vehicles",
    studied: "Flammability of solid spacecraft materials at large scale.",
    informs: "Choosing spacecraft cabin materials, using how large fires actually grow inside a real vehicle.",
    sample: "Saffire-II: flat sheets 29 cm × 5 cm, 0.27–1.03 mm thick (one 1 cm PMMA sample) — silicone, cotton-fiberglass (SIBAL), PMMA, Nomex; lit by an 80–97 W igniter in 20 cm/s air flowing with or against the flame (PSI-99 table).",
    sensors: "Saffire-II: two cameras per sample; burn length, spread length and spread rate recorded (PSI-99 table).",
    psi: [{ id: "PSI-98", label: "Saffire-I" }, { id: "PSI-99", label: "Saffire-II" }, { id: "PSI-100", label: "Saffire-III" }],
    notModeled: "Saffire-II is in the model. Saffire-I and -III tables have no O₂, spread rate or outcome.",
    tags: { flammability: true, airflow: true }, inApp: "Saffire", /* this app has Saffire-II runs only (data/SOURCES.md) */ dataset: "https://doi.org/10.60555/2chp-m469",
  },
  {
    id: "same", name: "SAME & SAME-R", full: "Smoke and Aerosol Measurement Experiment", pillars: ["detection"], fuels: [],
    hardware: "Smoke and aerosol measurement instruments",
    studied: "How fire detection (smoke measurement) works in microgravity.",
    informs: "Smoke detectors for spacecraft and habitats.",
    tags: { detection: true },
  },
  {
    id: "daft", name: "DAFT & DAFT-2", full: "Dust and Aerosol Measurement Feasibility Test", pillars: ["detection"], fuels: [],
    hardware: "One of the SAME smoke-detection instruments, used for dust",
    studied: "Detecting dust with an instrument that SAME used for smoke detection.",
    informs: "Aerosol instruments shared with spacecraft smoke detection.",
    tags: { detection: true },
  },
  {
    id: "flex", name: "FLEX", full: "Flame Extinguishment Experiment", pillars: ["suppression"], fuels: ["liquid droplet"],
    hardware: "Multi-user Droplet Combustion Apparatus (MDCA) in the Combustion Integrated Rack (CIR)",
    studied: "Suppression: diluting the chamber atmosphere with carbon dioxide and helium, using burning droplets of liquid fuel.",
    informs: "Extinguishing fires by diluting the cabin atmosphere (carbon dioxide, helium).",
    sample: "Free-floating fuel droplets, 1.1–4.67 mm across at ignition (PSI-69 table); chamber air with 12–34% O₂, and in many tests added CO₂ (up to 70%) or helium (up to 45%).",
    sensors: "Droplet burning rate, flame size at extinction, burn time and how each test ended (table); NASA lists high-resolution measurements of burning rate, extinction, heat radiation, soot and temperature as goals (PSI-69 objectives).",
    psi: [{ id: "PSI-69", label: "FLEX" }],
    tags: { suppression: true }, inApp: "FLEX", dataset: "https://doi.org/10.60555/mbq8-0451",
  },
  {
    id: "flex2", name: "FLEX-2", full: "Flame Extinguishment Experiment 2", pillars: ["suppression"], fuels: ["liquid droplet"],
    hardware: "MDCA in the CIR",
    studied: "Burning droplets of liquid fuel, on the same apparatus as FLEX.",
    psi: [{ id: "PSI-68", label: "FLEX-2" }],
    notModeled: "Checked: the PSI table gives 8 parameter ranges, not individual runs.",
    tags: { suppression: true },
  },
  {
    id: "cfi", name: "CFI", full: "Cool Flames Investigation", pillars: [], fuels: ["liquid droplet"],
    hardware: "MDCA in the CIR",
    studied: "Burning droplets of liquid fuel and cool flames.",
    tags: {},
  },
  {
    id: "bre", name: "BRE", full: "Burning Rate Emulator", project: "ACME", pillars: ["prevention"], fuels: ["gas"],
    hardware: "ACME modular hardware in the CIR",
    studied: "Materials flammability in still atmospheres as a function of material properties (emulated with gaseous fuels).",
    informs: "Flammability limits of materials in still air, for material selection.",
    notModeled: "Checked (ACME, PSI-20/21/22/23/10/159): gas-flame studies with no flame-spread measure to train on.",
    tags: { flammability: true },
  },
  {
    id: "cfig", name: "CFI-G", full: "Cool Flames Investigation with Gases", project: "ACME", pillars: ["prevention"], fuels: ["gas"],
    hardware: "ACME modular hardware in the CIR, spherical burner",
    studied: "The highest-oxygen microgravity tests: up to 85% oxygen flowing from a spherical burner, creating an inside-out flame.",
    informs: "Fire-risk limits for high-oxygen atmospheres such as a Moon base or pressurized rover.",
    notModeled: "Checked (ACME, PSI-20/21/22/23/10/159): gas-flame studies with no flame-spread measure to train on.",
    tags: { highO2: true, flammability: true },
  },
  {
    id: "efield", name: "E-FIELD Flames", full: "Electric-Field Effects on Laminar Diffusion Flames", project: "ACME", pillars: [], fuels: ["gas"],
    hardware: "ACME modular hardware in the CIR",
    studied: "Mimicking partial gravity by using an electric field to act on the ions that naturally occur in flames.",
    informs: "Estimating fire behaviour at Moon and Mars gravity before partial-gravity data exists.",
    notModeled: "Checked (ACME, PSI-20/21/22/23/10/159): gas-flame studies with no flame-spread measure to train on.",
    tags: { partialG: true },
  },
  {
    id: "spice", name: "SPICE", full: "Smoke Point In Co-flow Experiment", pillars: [], fuels: ["gas"],
    hardware: "MSG, modular fan-driven flow duct (built for SPICE)",
    studied: "Smoke point of gaseous-fuel flames in a co-flow.",
    tags: { airflow: true },
  },
  {
    id: "slice", name: "SLICE", full: "Structure & Liftoff In Combustion Experiment", pillars: [], fuels: ["gas"],
    hardware: "MSG, modular fan-driven flow duct",
    studied: "Flame structure and liftoff of gaseous-fuel flames.",
    tags: { airflow: true },
  },
];

/** From the statement: no partial-gravity combustion data is in PSI yet; planned sources named there. */
export const PARTIAL_G_NOTE =
  "PSI has no partial-gravity combustion data yet (future: LUCI, FM2). Microgravity and normal-gravity results bound what happens on the Moon or Mars.";

/** From the statement: NASA spin-offs to fire safety on Earth. */
export const EARTH_SPINOFFS = [
  "Fine-water-mist extinguishers developed for the ISS",
  "Improved smoke detection",
  "Firefighter protective clothing and air tanks",
];

/** Official PSI search for an investigation (for the ones whose sample/sensor details aren't in this app yet). */
export const psiSearch = (q: string) => `https://psi.nasa.gov/physci/repo/search?q=${encodeURIComponent(q)}&data_source=psi&data_type=investigation`;

/** From the statement's "Spacesuits and oxygen concentration" consideration. */
export const MOON_O2_NOTE =
  "Why so much oxygen? Spacesuits hold pure oxygen at only 29.6 kPa (4.3 psi), and astronauts must pre-breathe oxygen before going outside. To shorten that, Moon bases and rovers will likely run at 30% O₂ or more and 70 kPa (10.2 psi) or less — over 40% more oxygen than Earth air, which makes materials much more flammable.";

export const psiPage = (id: string) => `https://psi.nasa.gov/physci/repo/data/investigations/${id}`;
