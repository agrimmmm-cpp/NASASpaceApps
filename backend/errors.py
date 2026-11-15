"""Error envelope (docs/02_API_CONTRACT.md). Never leaks a stack trace (I-10)."""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("fire.errors")


class ApiException(Exception):
    def __init__(self, code: str, message: str, status: int, details: Optional[dict[str, Any]] = None):
        self.code, self.message, self.status, self.details = code, message, status, details
        super().__init__(message)


def envelope(code: str, message: str, details: Optional[dict] = None) -> dict:
    body: dict[str, Any] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


def unknown_material(material: str, known: list[str]) -> ApiException:
    return ApiException("UNKNOWN_MATERIAL", f"Unknown material '{material}'", 422,
                        {"field": "material", "got": material, "allowed": known})


def model_not_ready() -> ApiException:
    return ApiException("MODEL_NOT_READY", "Model is still training, retry shortly", 503)


def _validation_body(exc: RequestValidationError) -> dict:
    errs = exc.errors()
    first = errs[0] if errs else {}
    loc = [str(p) for p in first.get("loc", []) if p not in ("body", "query")]
    field = loc[-1] if loc else None
    ctx = first.get("ctx") or {}
    etype = first.get("type", "")
    details: dict[str, Any] = {"field": field}
    if etype in ("greater_than_equal", "less_than_equal", "greater_than", "less_than"):
        lo, hi = _bounds(field)
        details.update(min=lo, max=hi, got=first.get("input"))
        msg = f"{field} must be between {_fmt(lo)} and {_fmt(hi)}"
    elif etype in ("finite_number",):
        msg = f"{field} must be a finite number"
    elif etype == "json_invalid":
        msg, details = "Request body is not valid JSON", {}
    elif etype == "missing":
        msg = f"{field} is required"
    elif etype in ("string_too_long", "string_too_short"):
        msg = f"{field} length is out of range"
        details.update({k: v for k, v in ctx.items() if k in ("max_length", "min_length")})
    elif etype in ("too_short",):
        msg = f"{field} must not be empty"
    else:
        msg = f"Invalid value for {field}" if field else "Invalid request"
    return envelope("VALIDATION_ERROR", msg, {k: v for k, v in details.items() if v is not None})


def _bounds(field: Optional[str]):
    import config

    r = config.RANGES.get(field or "")
    return (r["min"], r["max"]) if r else (None, None)


def _fmt(x) -> str:
    return "?" if x is None else (str(int(x)) if float(x).is_integer() else str(x))


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiException)
    async def _api(_: Request, exc: ApiException):
        return JSONResponse(envelope(exc.code, exc.message, exc.details), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return JSONResponse(_validation_body(exc), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled error")  # trace goes to logs only
        return JSONResponse(envelope("INTERNAL", "Internal server error"), status_code=500)
