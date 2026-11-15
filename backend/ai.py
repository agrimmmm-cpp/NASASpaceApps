"""Orchestrates /api/insights and /api/ask: retrieve -> try the LLM -> validated result, else template (never an error)."""
from __future__ import annotations

import llm
import retrieval
import templates
from services import AppState


def insights(st: AppState, sc: dict, pred: dict) -> dict:
    near = retrieval.nearest_runs(st.dataset.df, sc)
    source = st.dataset.source
    result = llm.insights(sc, pred, near, source, st.predictor.version)
    generated_by = "llm"
    if result is None:
        result, generated_by = templates.insights(sc, pred, near, source), "template"
    return {"scenario": sc, "insights": result, "retrieved_run_ids": near["run_id"].tolist(),
            "generated_by": generated_by, "data_source": source}


def ask(st: AppState, sc: dict, pred: dict, question: str) -> dict:
    near = retrieval.nearest_runs(st.dataset.df, sc)
    source = st.dataset.source
    ids = near["run_id"].tolist()
    if not templates.on_topic(question):  # decline without spending an LLM call
        res, generated_by = {"answer": templates.DECLINE, "cited_run_ids": []}, "template"
    else:
        res = llm.ask(question, sc, pred, near, source, st.predictor.version)
        generated_by = "llm"
        if res is None:
            res, generated_by = templates.answer(question, sc, pred, near, source), "template"
    return {"answer": res["answer"], "cited_run_ids": res["cited_run_ids"], "retrieved_run_ids": ids,
            "generated_by": generated_by, "data_source": source}
