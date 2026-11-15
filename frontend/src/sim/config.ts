// Command Mode constants (06_TIER4_SPEC §B). One place, documented; the engine and the score tooltip read these.
export const DT = 0.5;                      // sim step, seconds
export const DURATION_S = 90;               // the drill lasts 90 s
export const DECISION_TIMES = [10, 30, 60]; // pause points (multiples of DT)
export const DECISION_SECONDS = 10;         // time to choose before "no action" is auto-picked
export const TICK_MS = 500;                 // real ms per DT step => 1 sim-second per real second (?fast=1 => 4×)

/** Extinction hazard per step = extinction_probability × DT / TAU_S (seeded RNG).
 *  The spec suggests τ = 8 s; with the NASA FLEX droplet data (extinction ≈ 0.8) that ends almost every run before the
 *  first decision, so the drill uses 30 s to stay playable. Cosmetic/gameplay constant — not a model output. */
export const TAU_S = 30;
/** No self-extinction before the first decision: the flame is still establishing (keeps every drill playable). */
export const IGNITION_S = 10;

/** Flame-front growth: radius grows by spread × DT × K_GROW (mm). Cosmetic but fixed so runs are comparable. */
export const K_GROW = 2.5;
export const FAIL_AREA_CM2 = 300;           // burned area that counts as losing the module
export const CONTAIN_SPREAD = 0.05;         // below this for CONTAIN_HOLD_S => contained (matches NO_ESCALATION_SPREAD)
export const CONTAIN_HOLD_S = 5;

// Action effects
export const CO2_O2_DROP = 6;               // CO₂ extinguisher: O₂ −6 points…
export const CO2_WINDOW_S = 20;             // …for 20 s
export const CO2_RECOVER_PER_S = 1;         // then recovers +1 point/s
export const CO2_EXTRA_EXTINCTION = 0.25;   // and +0.25 extinction probability while active…
export const CO2_TAU_S = 4;                  // …acting on a 4 s time scale (a direct hit on the flame, not a slow drift)
export const LOWER_O2_PER_S = 3 / 5;        // lower O₂ supply: −3 points every 5 s…
export const LOWER_O2_MIN = 16;             // …down to 16 %

// Score = 1000 − A·area_cm2 − B·seconds_to_end − C·[evacuated] − D·[failed], floored at 0.
// With FAIL_AREA_CM2 = 300 and 90 s, any evacuation scores more than any failure (unit-tested).
export const SCORE_A = 1;
export const SCORE_B = 4;
export const SCORE_C = 150;
export const SCORE_D = 500;
