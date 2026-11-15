"""Template fallback for insights and ask (docs/04_MODEL_SPEC.md section 8). Always available, instant, deterministic.

Rule: every sentence is COMPUTED from the retrieved runs / prediction, and a rule only fires when its condition holds (R-12).
Every insight cites at least one retrieved run (I-11). In mock mode text is prefixed "[MOCK]" so it can't pass as real results (I-09).
"""
from __future__ import annotations

import re
from typing import Optional

import pandas as pd

DECLINE = ("I can only answer questions about fire behaviour, materials and spacecraft conditions "
           "using this dataset. Try asking about oxygen, airflow, gravity or a material.")
_TOPIC = re.compile(
    r"fire|flame|burn|combust|ignit|extingu|spread|oxygen|\bo2\b|\bo₂\b|pressure|airflow|air flow|ventilat|\bfans?\b|gravity|"
    r"microgravity|zero.?g|\bg\b|material|pmma|nomex|sibal|heptane|ethanol|methane|fuel|risk|safe|danger|hazard|temperature|"
    r"spacecraft|station|\biss\b|moon|lunar|mars|gateway|habitat|cabin|experiment|\brun\b|runs|dataset|data|nasa|model|"
    r"predict|why|how|what|which|compare|earth|soot|smoke|suppress|co2", re.I)
_REQUIRES_TOPIC_WORDS = re.compile(r"[a-z]", re.I)


def on_topic(question: str) -> bool:
    """Cheap guard so obviously unrelated questions are declined without spending an LLM call."""
    q = question.strip()
    if not q or not _REQUIRES_TOPIC_WORDS.search(q):
        return False
    # "what/how/why" alone are too generic: require at least one domain word besides the interrogatives
    stripped = re.sub(r"\b(why|how|what|which|data|model|run|runs)\b", " ", q, flags=re.I)
    return bool(_TOPIC.search(stripped))


def prefix(data_source: str) -> str:
    return "[MOCK] " if data_source == "mock" else ""


def short(r: pd.Series) -> str:
    sp = "no spread rate recorded" if pd.isna(r["spread_rate_mm_s"]) else f"spread {r['spread_rate_mm_s']:.2f} mm/s"
    ex = {True: "self-extinguished", False: "kept burning"}.get(None if pd.isna(r["extinguished"]) else bool(r["extinguished"]),
                                                                  "outcome not recorded")
    return (f"{r['run_id']} ({r['material']}, {r['gravity_g']:g} g, {r['o2_percent']:g}% O2, "
            f"{r['airflow_cm_s']:g} cm/s): {sp}, {ex}")


def _ids(df: pd.DataFrame, n: int = 3) -> list[str]:
    return df["run_id"].tolist()[:n]


def insights(sc: dict, pred: dict, near: pd.DataFrame, data_source: str) -> list[dict]:
    """3-5 insights, each citing rows of `near` (the retrieved set)."""
    pre, out = prefix(data_source), []

    def add(text: str, rows: pd.DataFrame) -> None:
        ids = _ids(rows)
        if ids:
            out.append({"text": pre + text, "cited_run_ids": ids})

    n = len(near)
    p_ext = pred["extinction_probability"]

    known = near[near["extinguished"].notna()]
    if len(known) >= 1:
        died = known[known["extinguished"].astype(bool)]
        if len(died):
            add(f"{len(died)} of the {len(known)} closest runs self-extinguished; the model puts the chance this flame "
                f"goes out at {p_ext:.0%}.", died)
        elif len(known) >= 3:
            add(f"None of the {len(known)} closest runs self-extinguished, so the flame is likely to survive "
                f"(model: {1 - p_ext:.0%} chance it keeps burning).", known)

    sp = near[near["spread_rate_mm_s"].notna()].sort_values("spread_rate_mm_s")
    if len(sp):
        lo_r, hi_r = sp.iloc[0], sp.iloc[-1]
        rng = (f"{lo_r['spread_rate_mm_s']:.2f} to {hi_r['spread_rate_mm_s']:.2f} mm/s" if len(sp) > 1
               else f"{lo_r['spread_rate_mm_s']:.2f} mm/s")
        lo, hi = pred["spread_rate_ci"]
        add(f"In the {len(sp)} closest runs the flame spread at {rng}; the model predicts {pred['spread_rate_mm_s']:.2f} mm/s "
            f"(likely range {lo:.2f}-{hi:.2f}).", sp)

    tt = near[near["flame_temp_k"].notna()].sort_values("flame_temp_k")
    if len(tt):
        t_lo, t_hi = tt["flame_temp_k"].iloc[0], tt["flame_temp_k"].iloc[-1]
        span = f"{t_lo:.0f}-{t_hi:.0f} K" if len(tt) > 1 else f"{t_lo:.0f} K"
        add(f"Flame temperatures in the closest runs were {span}; the model predicts {pred['flame_temp_k']:.0f} K "
            f"at {sc['gravity_g']:g} g.", tt)

    if sc["gravity_g"] < 0.3 and sc["airflow_cm_s"] < 3:
        low = near[near["airflow_cm_s"] < 3]
        lk = low[low["extinguished"].notna()]
        if len(lk):
            k = int(lk["extinguished"].astype(bool).sum())
            add(f"Airflow is very low ({sc['airflow_cm_s']:g} cm/s) and without buoyancy nothing refreshes the oxygen; "
                f"{k} of the {len(lk)} nearby low-airflow runs self-extinguished.", lk)

    if sc["o2_percent"] >= 28:
        hi_o2 = near[(near["o2_percent"] >= 28) & near["spread_rate_mm_s"].notna()]
        if len(hi_o2):
            add(f"Oxygen is enriched ({sc['o2_percent']:g}%); the nearby high-oxygen runs spread at "
                f"{hi_o2['spread_rate_mm_s'].min():.2f}-{hi_o2['spread_rate_mm_s'].max():.2f} mm/s.", hi_o2)
    elif sc["o2_percent"] <= 19:
        lo_o2 = near[near["o2_percent"] <= 19]
        lk = lo_o2[lo_o2["extinguished"].notna()]
        if len(lk):
            add(f"Oxygen is reduced ({sc['o2_percent']:g}%); {int(lk['extinguished'].astype(bool).sum())} of the "
                f"{len(lk)} nearby low-oxygen runs self-extinguished.", lk)

    if pred["matching_runs"] < 3:
        add(f"Only {pred['matching_runs']} run(s) in the dataset closely match these conditions, so this prediction is an "
            f"extrapolation; the nearest evidence is listed.", near.head(2))

    for _, r in near.iterrows():  # pad to the contract minimum of 3 with plain descriptions of the closest runs
        if len(out) >= 3:
            break
        add(f"Closest run: {short(r)}.", near[near["run_id"] == r["run_id"]])
    return out[:5]


def answer(question: str, sc: dict, pred: dict, near: pd.DataFrame, data_source: str) -> dict:
    if not on_topic(question):
        return {"answer": DECLINE, "cited_run_ids": []}
    if near.empty:
        return {"answer": "The dataset doesn't contain runs that answer this.", "cited_run_ids": []}
    pre = prefix(data_source)
    text = (f"{pre}At {sc['o2_percent']:g}% O2, {sc['pressure_kpa']:g} kPa, {sc['airflow_cm_s']:g} cm/s airflow and "
            f"{sc['gravity_g']:g} g, the model predicts a flame spread of {pred['spread_rate_mm_s']:.2f} mm/s, a risk index of "
            f"{pred['risk_index']:.0f}/100 ({pred['risk_band']}) and a {pred['extinction_probability']:.0%} chance the flame "
            f"goes out. Closest evidence: {short(near.iloc[0])}.")
    return {"answer": text, "cited_run_ids": _ids(near, 2)}
