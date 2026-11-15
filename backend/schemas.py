"""Pydantic models mirroring docs/02_API_CONTRACT.md. frontend/src/types.ts must mirror these (I-01: snake_case)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

import config

DataSource = Literal["mock", "nasa"]
RiskBand = Literal["low", "elevated", "high", "critical"]
FuelType = Literal["solid", "droplet", "gas"]
Grade = Literal["A", "B", "C", "D", "E", "F"]
ShapFeature = Literal["material", "o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"]
GeneratedBy = Literal["llm", "template"]

_R = config.RANGES


def _rng(name: str) -> dict:
    # allow_inf_nan=False so NaN/Infinity are 422, never silently accepted (I-14)
    return dict(ge=_R[name]["min"], le=_R[name]["max"], allow_inf_nan=False)


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")  # unknown request fields are ignored (02 global conventions)


# ---- requests ------------------------------------------------------------
class Scenario(_Base):
    material: str = Field(min_length=1)
    o2_percent: float = Field(**_rng("o2_percent"))
    pressure_kpa: float = Field(**_rng("pressure_kpa"))
    airflow_cm_s: float = Field(**_rng("airflow_cm_s"))
    gravity_g: float = Field(**_rng("gravity_g"))


class HeatmapRequest(_Base):
    material: str = Field(min_length=1)
    pressure_kpa: float = Field(**_rng("pressure_kpa"))
    gravity_g: float = Field(**_rng("gravity_g"))


class CompareRequest(_Base):
    material: str = Field(min_length=1)
    o2_percent: float = Field(**_rng("o2_percent"))
    pressure_kpa: float = Field(**_rng("pressure_kpa"))
    airflow_cm_s: float = Field(**_rng("airflow_cm_s"))


class InsightsRequest(_Base):
    scenario: Scenario  # any client-supplied "prediction" field is ignored (extra="ignore")


class AskRequest(_Base):
    question: str = Field(min_length=1, max_length=500)
    scenario: Scenario


class TTSRequest(_Base):
    text: str = Field(min_length=1, max_length=800)  # Nova's answers are <= 120 words (contract /api/ask)


class PassportRequest(_Base):
    o2_percent: float = Field(**_rng("o2_percent"))
    pressure_kpa: float = Field(**_rng("pressure_kpa"))
    airflow_cm_s: float = Field(**_rng("airflow_cm_s"))
    gravity_g: float = Field(**_rng("gravity_g"))


class AdviseState(_Base):
    spread_rate_mm_s: float
    extinction_probability: float
    risk_index: float


class AdviseRequest(_Base):
    scenario: Scenario
    t_s: float = Field(ge=0, le=600)
    state: AdviseState
    options: list[str] = Field(min_length=1, max_length=8)


# ---- errors --------------------------------------------------------------
class ApiErrorBody(BaseModel):
    code: Literal["VALIDATION_ERROR", "UNKNOWN_MATERIAL", "MODEL_NOT_READY", "DATA_ERROR", "INTERNAL"]
    message: str
    details: Optional[dict] = None


class ApiError(BaseModel):
    error: ApiErrorBody


# ---- responses -----------------------------------------------------------
class Health(BaseModel):
    status: Literal["ok"]
    model_ready: bool
    data_source: DataSource


class MaterialInfo(BaseModel):
    id: str
    label: str
    fuel_type: FuelType


class VehiclePreset(BaseModel):
    id: str
    label: str
    o2_percent: float
    pressure_kpa: float
    airflow_cm_s: float
    gravity_g: float
    note: str


class RangeInfo(BaseModel):
    min: float
    max: float
    step: float


class Ranges(BaseModel):
    o2_percent: RangeInfo
    pressure_kpa: RangeInfo
    airflow_cm_s: RangeInfo
    gravity_g: RangeInfo


class GravityMark(BaseModel):
    value: float
    label: str


class RiskBandInfo(BaseModel):
    band: RiskBand
    min: float
    max: float


class GradeBandInfo(BaseModel):
    grade: Grade
    max_risk: float


class CiWiden(BaseModel):
    g_min: float
    g_max: float
    factor: float


class ModelWeights(BaseModel):
    spread: float
    survival: float


class ModelMetrics(BaseModel):
    # null (None) when undefined, e.g. before training or single-class data; never a fake number (04 section 3)
    spread_r2: Optional[float] = None
    temp_r2: Optional[float] = None
    extinction_auc: Optional[float] = None
    n_train: Optional[int] = None


class ModelCapabilities(BaseModel):
    """What the loaded data can honestly support. The UI hides panels whose capability is false."""
    flame_temp: bool        # false => flame_temp_k is null everywhere
    gravity_effect: bool    # false => no 0 g AND 1 g data; the Earth-vs-Space comparison is meaningless


class ModelInfo(BaseModel):
    version: str
    trained_at: str
    spread_ref_mm_s: float
    weights: ModelWeights
    critical_length_mm: float
    ci_widen: CiWiden
    metrics: ModelMetrics
    capabilities: ModelCapabilities
    stub: bool


class Meta(BaseModel):
    data_source: DataSource
    n_runs: int
    materials: list[MaterialInfo]
    experiments: list[str]
    vehicles: list[VehiclePreset]
    ranges: Ranges
    gravity_marks: list[GravityMark]
    risk_bands: list[RiskBandInfo]
    grade_bands: list[GradeBandInfo]
    model: ModelInfo
    llm_enabled: bool


class Run(BaseModel):
    run_id: str
    experiment: str
    fuel_type: FuelType
    material: str
    gravity_g: float
    o2_percent: float
    pressure_kpa: float
    airflow_cm_s: float
    spread_rate_mm_s: Optional[float] = None
    flame_temp_k: Optional[float] = None
    extinguished: Optional[bool] = None
    burn_duration_s: Optional[float] = None
    source_note: str


class RunsResponse(BaseModel):
    runs: list[Run]
    total: int
    truncated: bool
    data_source: DataSource


class ShapItem(BaseModel):
    feature: ShapFeature
    contribution: float


class Prediction(BaseModel):
    scenario: Scenario
    spread_rate_mm_s: float
    spread_rate_ci: tuple[float, float]
    ci_widened: bool
    flame_temp_k: Optional[float]   # null when the dataset has no flame-temperature measurements (meta.model.capabilities.flame_temp)
    extinction_probability: float
    risk_index: float
    risk_band: RiskBand
    time_to_critical_s: Optional[float]
    shap: list[ShapItem]
    shap_base: float
    matching_runs: int
    data_source: DataSource
    model_version: str


class Heatmap(BaseModel):
    material: str
    pressure_kpa: float
    gravity_g: float
    o2_values: list[float]
    airflow_values: list[float]
    risk: list[list[float]]  # risk[airflow_index][o2_index]  (I-07)
    data_source: DataSource


class CompareSide(BaseModel):
    gravity_g: float
    spread_rate_mm_s: float
    flame_temp_k: Optional[float]
    extinction_probability: float
    risk_index: float


class CompareScenario(BaseModel):
    material: str
    o2_percent: float
    pressure_kpa: float
    airflow_cm_s: float


class Compare(BaseModel):
    scenario: CompareScenario
    microgravity: CompareSide
    earth: CompareSide
    data_source: DataSource


class Insight(BaseModel):
    text: str
    cited_run_ids: list[str] = Field(min_length=1)  # I-11


class InsightsResponse(BaseModel):
    scenario: Scenario
    insights: list[Insight]
    retrieved_run_ids: list[str]
    generated_by: GeneratedBy
    data_source: DataSource


class AskResponse(BaseModel):
    answer: str
    cited_run_ids: list[str]
    retrieved_run_ids: list[str]
    generated_by: GeneratedBy
    data_source: DataSource


class PassportEntry(BaseModel):
    material: str
    label: str
    fuel_type: FuelType
    risk_index: float
    grade: Grade
    spread_rate_mm_s: float
    extinction_probability: float
    flame_temp_k: Optional[float]
    matching_runs: int


class PassportConditions(BaseModel):
    o2_percent: float
    pressure_kpa: float
    airflow_cm_s: float
    gravity_g: float


class Passport(BaseModel):
    conditions: PassportConditions
    entries: list[PassportEntry]
    data_source: DataSource


class AdviseResponse(BaseModel):
    recommended_action_id: str
    justification: str
    cited_run_ids: list[str]
    generated_by: GeneratedBy
    data_source: DataSource
