// Fetch wrapper (05 §1): base "/api", AbortController support, error-envelope parsing, boundary shape check (R-16).
// Every failure is normalised to ApiErrorBody so panels have one error shape to render.
import type {
  ApiErrorBody, AskRequest, AskResponse, Compare, CompareRequest, Health, Heatmap, HeatmapRequest,
  InsightsResponse, Meta, Prediction, RunsResponse, Scenario,
} from "../types";

export class ApiFailure extends Error {
  constructor(public body: ApiErrorBody, public status: number) {
    super(body.message);
  }
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function isEnvelope(x: unknown): x is { error: ApiErrorBody } {
  return typeof x === "object" && x !== null && "error" in x &&
    typeof (x as { error: { code?: unknown } }).error?.code === "string";
}

async function request<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal;
  check: (x: unknown) => boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiFailure({ code: "INTERNAL", message: "Can't reach the mission server" }, 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body handled below */
  }
  if (!res.ok) {
    if (isEnvelope(json)) throw new ApiFailure(json.error, res.status);
    // No envelope means the backend didn't answer (e.g. Vite proxy 502/500 while the backend is down)
    throw new ApiFailure({ code: "INTERNAL", message: `Can't reach the mission server (HTTP ${res.status})` }, res.status);
  }
  if (!init.check(json)) {
    throw new ApiFailure({ code: "INTERNAL", message: "Unexpected response from server" }, res.status);
  }
  return json as T;
}

const has = (...keys: string[]) => (x: unknown) =>
  typeof x === "object" && x !== null && keys.every((k) => k in x);

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/health", { signal, check: has("status", "model_ready") }),
  meta: (signal?: AbortSignal) =>
    request<Meta>("/meta", { signal, check: has("materials", "ranges", "vehicles", "model", "data_source") }),
  runs: (q: Record<string, string | number | undefined> = {}, signal?: AbortSignal) =>
    request<RunsResponse>(`/runs${qs(q)}`, { signal, check: has("runs", "total") }),
  predict: (body: Scenario, signal?: AbortSignal) =>
    request<Prediction>("/predict", { method: "POST", body, signal, check: has("scenario", "risk_index") }),
  heatmap: (body: HeatmapRequest, signal?: AbortSignal) =>
    request<Heatmap>("/heatmap", { method: "POST", body, signal, check: has("risk", "o2_values", "airflow_values") }),
  compare: (body: CompareRequest, signal?: AbortSignal) =>
    request<Compare>("/compare", { method: "POST", body, signal, check: has("microgravity", "earth") }),
  insights: (scenario: Scenario, signal?: AbortSignal) =>
    request<InsightsResponse>("/insights", { method: "POST", body: { scenario }, signal, check: has("insights") }),
  ask: (body: AskRequest, signal?: AbortSignal) =>
    request<AskResponse>("/ask", { method: "POST", body, signal, check: has("answer") }),
};
