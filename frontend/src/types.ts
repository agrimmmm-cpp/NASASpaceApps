// Mirrors docs/02_API_CONTRACT.md and backend/schemas.py exactly (I-01: snake_case). Hand-written.
// Nothing here is data: materials, ranges, presets, bands all come from GET /api/meta at runtime.

export type DataSource = "mock" | "nasa";
export type MaterialId = string; // canonical id from Meta.materials[].id (I-04)
export type RiskBand = "low" | "elevated" | "high" | "critical";
export type FuelType = "solid" | "droplet" | "gas";
export type Grade = "A" | "B" | "C" | "D" | "E" | "F";
export type GeneratedBy = "llm" | "template";
export type ShapFeature = "material" | "o2_percent" | "pressure_kpa" | "airflow_cm_s" | "gravity_g";

export interface Scenario {
  material: MaterialId;
  o2_percent: number;
  pressure_kpa: number;
  airflow_cm_s: number;
  gravity_g: number;
}

// ---- errors ----
export type ErrorCode = "VALIDATION_ERROR" | "UNKNOWN_MATERIAL" | "MODEL_NOT_READY" | "DATA_ERROR" | "INTERNAL";
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
export interface ApiError {
  error: ApiErrorBody;
}

// ---- /api/health ----
export interface Health {
  status: "ok";
  model_ready: boolean;
  data_source: DataSource;
}

// ---- /api/meta ----
export interface MaterialInfo {
  id: MaterialId;
  label: string;
  fuel_type: FuelType;
}
export interface VehiclePreset {
  id: string;
  label: string;
  o2_percent: number;
  pressure_kpa: number;
  airflow_cm_s: number;
  gravity_g: number;
  note: string;
}
export interface RangeInfo {
  min: number;
  max: number;
  step: number;
}
export type ScenarioNumberKey = "o2_percent" | "pressure_kpa" | "airflow_cm_s" | "gravity_g";
export interface Meta {
  data_source: DataSource;
  n_runs: number;
  materials: MaterialInfo[];
  experiments: string[];
  vehicles: VehiclePreset[];
  ranges: Record<ScenarioNumberKey, RangeInfo>;
  gravity_marks: { value: number; label: string }[];
  risk_bands: { band: RiskBand; min: number; max: number }[]; // [min, max); last max inclusive
  grade_bands: { grade: Grade; max_risk: number }[];
  model: {
    version: string;
    trained_at: string;
    spread_ref_mm_s: number;
    weights: { spread: number; survival: number };
    critical_length_mm: number;
    ci_widen: { g_min: number; g_max: number; factor: number };
    metrics: {
      spread_r2: number | null;
      temp_r2: number | null;
      extinction_auc: number | null;
      n_train: number | null;
    };
    stub: boolean;
    /** What the loaded data can support. On mock both are true; on the real NASA data both are false. */
    capabilities: { flame_temp: boolean; gravity_effect: boolean };
  };
  llm_enabled: boolean;
}

// ---- /api/runs ----
export interface Run {
  run_id: string;
  experiment: string;
  fuel_type: FuelType;
  material: MaterialId;
  gravity_g: number;
  o2_percent: number;
  pressure_kpa: number;
  airflow_cm_s: number;
  spread_rate_mm_s: number | null;
  flame_temp_k: number | null;
  extinguished: boolean | null;
  burn_duration_s: number | null;
  source_note: string;
}
export interface RunsResponse {
  runs: Run[];
  total: number;
  truncated: boolean;
  data_source: DataSource;
}

// ---- /api/predict ----
export interface ShapItem {
  feature: ShapFeature;
  contribution: number;
}
export interface Prediction {
  scenario: Scenario;
  spread_rate_mm_s: number;
  spread_rate_ci: [number, number];
  ci_widened: boolean;
  flame_temp_k: number | null; // null when the data has no temperatures (capabilities.flame_temp = false)
  extinction_probability: number; // P(extinguish) — UI shows survival via lib/survival.ts (I-05)
  risk_index: number;
  risk_band: RiskBand;
  time_to_critical_s: number | null;
  shap: ShapItem[];
  shap_base: number;
  matching_runs: number;
  data_source: DataSource;
  model_version: string;
}

// ---- /api/heatmap ----
export type HeatmapRequest = Pick<Scenario, "material" | "pressure_kpa" | "gravity_g">;
export interface Heatmap {
  material: MaterialId;
  pressure_kpa: number;
  gravity_g: number;
  o2_values: number[];
  airflow_values: number[];
  risk: number[][]; // risk[airflow_index][o2_index] (I-07)
  data_source: DataSource;
}

// ---- /api/compare ----
export type CompareRequest = Omit<Scenario, "gravity_g">;
export interface CompareSide {
  gravity_g: number;
  spread_rate_mm_s: number;
  flame_temp_k: number | null;
  extinction_probability: number;
  risk_index: number;
}
export interface Compare {
  scenario: CompareRequest;
  microgravity: CompareSide;
  earth: CompareSide;
  data_source: DataSource;
}

// ---- /api/insights ----
export interface Insight {
  text: string;
  cited_run_ids: string[];
}
export interface InsightsResponse {
  scenario: Scenario;
  insights: Insight[];
  retrieved_run_ids: string[];
  generated_by: GeneratedBy;
  data_source: DataSource;
}

// ---- /api/ask ----
export interface AskRequest {
  question: string;
  scenario: Scenario;
}
export interface AskResponse {
  answer: string;
  cited_run_ids: string[];
  retrieved_run_ids: string[];
  generated_by: GeneratedBy;
  data_source: DataSource;
}
