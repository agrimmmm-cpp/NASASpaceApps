"""Gradient-boosting predictor: training, cached artifact, prediction, SHAP (docs/04_MODEL_SPEC.md sections 3-5).

Data-agnostic by design: it trains on whatever `data_loader` returned (mock now, real NASA CSV later) and re-trains
automatically when the data file changes (artifact name contains the data hash).

    load_or_train(dataset, materials) -> GBPredictor         (used by main.py and sanity_check.py)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_predict, cross_val_score

import config
import scoring
from data_loader import DataError, Dataset

log = logging.getLogger("fire.model")

NUMERIC = ["o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"]
FEATURES = ["material"] + NUMERIC


# ---------------------------------------------------------------- encoding
def encode(df: pd.DataFrame, materials: list[str]) -> np.ndarray:
    """One-hot(material) + numeric features. Column order = [material=<id>...] + NUMERIC (saved in the artifact)."""
    mats = df["material"].to_numpy()
    unknown = sorted(set(mats) - set(materials))
    if unknown:
        raise ValueError(f"unknown materials {unknown}")
    X = np.zeros((len(df), len(materials) + len(NUMERIC)))
    for i, m in enumerate(materials):
        X[:, i] = mats == m
    for j, f in enumerate(NUMERIC):
        X[:, len(materials) + j] = df[f].to_numpy(dtype=float)
    return X


class ConstantProb:
    """Stand-in classifier when the data has a single class (no fake learning)."""

    def __init__(self, p: float):
        self.p = float(p)
        self.classes_ = np.array([0, 1])

    def predict_proba(self, X):
        return np.tile([1 - self.p, self.p], (len(X), 1))


# ---------------------------------------------------------------- training
@dataclass
class Artifact:
    materials: list[str]
    spread: object
    spread_lo: object
    spread_hi: object
    temp: object
    ext: object
    spread_ref: float
    metrics: dict
    trained_at: str
    data_hash: str
    code_version: int


def _require(n: int, name: str) -> None:
    if n < config.MIN_TRAIN_ROWS:
        raise DataError(f"Not enough data to train the {name} model: {n} usable rows, need at least "
                        f"{config.MIN_TRAIN_ROWS}. Check data_report.json (null counts per target).")


def _cv_r2(X, y) -> Optional[float]:
    try:
        cv = KFold(n_splits=min(config.CV_FOLDS, len(y) // 6 or 2), shuffle=True, random_state=config.RANDOM_STATE)
        return round(float(cross_val_score(GradientBoostingRegressor(**config.GB_PARAMS), X, y, cv=cv, scoring="r2").mean()), 3)
    except Exception as e:  # undefined metric => null, never a fake number
        log.warning("r2 undefined: %s", e)
        return None


def train(ds: Dataset, materials: list[str]) -> Artifact:
    df = ds.df[ds.df["material"].isin(materials)]
    X_all = encode(df, materials)

    m_sp = df["spread_rate_mm_s"].notna().to_numpy()
    m_t = df["flame_temp_k"].notna().to_numpy()
    m_e = df["extinguished"].notna().to_numpy()
    _require(int(m_sp.sum()), "spread")
    _require(int(m_t.sum()), "flame-temperature")
    _require(int(m_e.sum()), "extinction")

    Xs, ys = X_all[m_sp], df["spread_rate_mm_s"].to_numpy(float)[m_sp]
    Xt, yt = X_all[m_t], df["flame_temp_k"].to_numpy(float)[m_t]
    Xe, ye = X_all[m_e], df.loc[m_e, "extinguished"].astype(int).to_numpy()

    P = config.GB_PARAMS
    spread = GradientBoostingRegressor(**P).fit(Xs, ys)
    lo_q, hi_q = config.CI_QUANTILES
    spread_lo = GradientBoostingRegressor(loss="quantile", alpha=lo_q, **P).fit(Xs, ys)
    spread_hi = GradientBoostingRegressor(loss="quantile", alpha=hi_q, **P).fit(Xs, ys)
    temp = GradientBoostingRegressor(**P).fit(Xt, yt)

    auc: Optional[float] = None
    if len(set(ye.tolist())) < 2:
        log.warning("extinction labels contain a single class; using a constant probability")
        ext = ConstantProb(float(ye[0]))
    else:
        if min(ye.sum(), len(ye) - ye.sum()) < 10 or ye.mean() < 0.1 or ye.mean() > 0.9:
            log.warning("extinction classes are imbalanced (%.0f%% positive)", 100 * ye.mean())
        # Probabilities are used raw (no calibration wrapper) so SHAP explains the very model that predicts.
        ext = GradientBoostingClassifier(**P).fit(Xe, ye)
        assert list(ext.classes_) == [0, 1], "positive class (extinguished) must be column 1 (R-13)"
        try:
            folds = min(config.CV_FOLDS, int(min(ye.sum(), len(ye) - ye.sum())))
            cv = StratifiedKFold(n_splits=max(folds, 2), shuffle=True, random_state=config.RANDOM_STATE)
            proba = cross_val_predict(GradientBoostingClassifier(**P), Xe, ye, cv=cv, method="predict_proba")[:, 1]
            auc = round(float(roc_auc_score(ye, proba)), 3)
        except Exception as e:
            log.warning("auc undefined: %s", e)

    spread_ref = max(float(np.percentile(ys, 99)), 0.1)
    metrics = {"spread_r2": _cv_r2(Xs, ys), "temp_r2": _cv_r2(Xt, yt), "extinction_auc": auc, "n_train": int(len(df))}
    log.info("trained on %d rows: %s, spread_ref=%.3f", len(df), metrics, spread_ref)
    return Artifact(materials=list(materials), spread=spread, spread_lo=spread_lo, spread_hi=spread_hi, temp=temp, ext=ext,
                    spread_ref=spread_ref, metrics=metrics,
                    trained_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    data_hash=ds.sha256, code_version=config.MODEL_CODE_VERSION)


def artifact_path(ds: Dataset, models_dir: Optional[Path] = None) -> Path:
    return Path(models_dir or config.MODELS_DIR) / f"model_{ds.sha256[:8]}_v{config.MODEL_CODE_VERSION}.joblib"


def load_or_train(ds: Dataset, materials: list[str], models_dir: Optional[Path] = None, force: bool = False) -> "GBPredictor":
    path = artifact_path(ds, models_dir)
    art: Optional[Artifact] = None
    if path.exists() and not force:
        try:
            art = joblib.load(path)
            if art.data_hash != ds.sha256 or art.code_version != config.MODEL_CODE_VERSION or art.materials != list(materials):
                art = None
        except Exception as e:  # corrupt/incompatible cache => retrain
            log.warning("ignoring cached model %s (%s)", path.name, e)
            art = None
    if art is None:
        art = train(ds, materials)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(art, path)
        log.info("saved %s", path)
    else:
        log.info("loaded cached model %s", path.name)
    return GBPredictor(art)


# ---------------------------------------------------------------- prediction
def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + np.exp(-x))


class GBPredictor:
    is_stub = False

    def __init__(self, art: Artifact):
        self.art = art
        self.spread_ref = art.spread_ref
        self.trained_at = art.trained_at
        self.metrics = art.metrics
        self.version = f"{art.trained_at}-{art.data_hash[:8]}"
        self.materials = art.materials
        self._exp_spread = self._exp_ext = None
        self._shap_failed = False

    # one prediction code path for every endpoint (I-16)
    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        a = self.art
        X = encode(df, self.materials)
        ext = a.ext.predict_proba(X)[:, 1]  # P(extinguished): column 1, asserted at train time (R-13)
        return scoring.finalize(df["gravity_g"].to_numpy(float), a.spread.predict(X), a.spread_lo.predict(X),
                                a.spread_hi.predict(X), a.temp.predict(X), ext, self.spread_ref)

    # ---- SHAP in risk-index points ------------------------------------------------
    def _explainers(self):
        if self._exp_spread is None:
            import shap  # imported lazily: slow import, optional dependency (R-11)

            self._exp_spread = shap.TreeExplainer(self.art.spread)
            self._exp_ext = None if isinstance(self.art.ext, ConstantProb) else shap.TreeExplainer(self.art.ext)
        return self._exp_spread, self._exp_ext

    def explain(self, scenario: dict, reference: dict) -> tuple[float, list[dict]]:
        """Return (shap_base, contributions). Positive contribution = raises risk. `reference` is unused (explainers have their own base)."""
        row = pd.DataFrame([scenario])[FEATURES]
        risk = float(self.predict_batch(row)["risk_index"].iat[0])
        if self._shap_failed:
            return risk, []
        try:
            exp_sp, exp_ext = self._explainers()
            x = encode(row, self.materials)
            sv_sp = np.asarray(exp_sp.shap_values(x)).reshape(-1)
            n_m = len(self.materials)
            W_S, W_E, ref = config.W_SPREAD, config.W_SURVIVAL, self.spread_ref

            pts = 100.0 * W_S * sv_sp / ref                                     # spread part: linear in mm/s
            base_spread = float(np.ravel(exp_sp.expected_value)[0])
            p_base = 0.0
            if exp_ext is not None:
                sv_e = np.asarray(exp_ext.shap_values(x)).reshape(-1)
                l_base = float(np.ravel(exp_ext.expected_value)[0])
                p_base = _sigmoid(l_base)
                p = _sigmoid(l_base + float(sv_e.sum()))
                # secant slope of the sigmoid between base and actual: keeps contributions additive and bounded (<= 0.25/log-odd)
                slope = (p - p_base) / sv_e.sum() if abs(sv_e.sum()) > 1e-6 else p * (1 - p)
                pts = pts + 100.0 * W_E * (-slope) * sv_e                       # more extinction => less risk
            else:
                p_base = float(self.art.ext.p)
            base = 100.0 * (W_S * float(np.clip(base_spread / ref, 0, 1)) + W_E * (1.0 - p_base))

            contrib = {"material": float(pts[:n_m].sum())}
            for j, f in enumerate(NUMERIC):
                contrib[f] = float(pts[n_m + j])
            items = [{"feature": f, "contribution": round(v, 2)} for f, v in contrib.items()]
            items.sort(key=lambda d: -abs(d["contribution"]))
            return round(float(base), 1), items
        except Exception as e:  # SHAP must never fail the request (04 section 5)
            self._shap_failed = True
            log.warning("SHAP unavailable, returning empty explanation: %s", e)
            return risk, []
