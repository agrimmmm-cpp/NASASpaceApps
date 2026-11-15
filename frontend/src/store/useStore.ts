// The ONE store (05 §2). Inputs are local-first; fetches are scheduled per the dependency table (05 §3, I-23).
// Nothing here is hard-coded data: the initial scenario comes from /api/meta, so mock → real needs no change.
import { create } from "zustand";
import { api, ApiFailure, isAbort } from "../api/client";
import type {
  ApiErrorBody, Compare, Heatmap, InsightsResponse, Meta, Passport, Prediction, RunsResponse, Scenario,
} from "../types";

export type Async<T> = {
  status: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: ApiErrorBody | null;
  requestId: number;
  warming?: boolean; // true while retrying MODEL_NOT_READY
};
const idle = <T,>(): Async<T> => ({ status: "idle", data: null, error: null, requestId: 0 });

type Slice = "prediction" | "heatmap" | "compare" | "insights" | "passport";
type Key = keyof Scenario;

// 05 §3 — which inputs each call depends on, and its debounce.
const DEPS: Record<Slice, Key[]> = {
  prediction: ["material", "o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"],
  heatmap: ["material", "pressure_kpa", "gravity_g"],
  compare: ["material", "o2_percent", "pressure_kpa", "airflow_cm_s"],
  passport: ["o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"], // all materials, so material changes don't refetch
  insights: ["material", "o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"],
};
const DEBOUNCE_MS: Record<Slice, number> = { prediction: 300, heatmap: 300, compare: 300, insights: 800, passport: 300 };
const WARMUP_RETRY_MS = 2000;
const WARMUP_MAX_MS = 180000; // model training on a slow free-tier CPU can take a few minutes
const WAKE_MAX_MS = 120000;  // sleeping free-tier server: keep retrying /api/meta this long

interface State extends Partial<Scenario> {
  vehicle_id: string | null;
  mode: "explore" | "command";
  meta: Async<Meta>;
  runs: Async<RunsResponse>;
  prediction: Async<Prediction>;
  heatmap: Async<Heatmap>;
  compare: Async<Compare>;
  passport: Async<Passport>;
  insights: Async<InsightsResponse>;
  selectedRunId: string | null;
  chatOpen: boolean;
  chatQuestion: string | null; // a question another section wants Nova to answer (consumed by AstronautChat)
  aboutOpen: boolean;

  init(): Promise<void>;
  setScenario(patch: Partial<Scenario>): void;
  applyVehicle(id: string): void;
  retry(slice: Slice | "meta" | "runs"): void;
  selectRun(id: string | null): void;
  setChatOpen(open: boolean): void;
  askNova(question: string): void;
  clearChatQuestion(): void;
  setAboutOpen(open: boolean): void;
  setMode(mode: "explore" | "command"): void;
}

const timers: Partial<Record<Slice, ReturnType<typeof setTimeout>>> = {};
const controllers: Partial<Record<string, AbortController>> = {};
const warmupStart: Partial<Record<Slice, number>> = {};

const toErr = (e: unknown): ApiErrorBody =>
  e instanceof ApiFailure ? e.body : { code: "INTERNAL", message: "Something went wrong" };

export function scenarioOf(s: Partial<Scenario>): Scenario | null {
  const { material, o2_percent, pressure_kpa, airflow_cm_s, gravity_g } = s;
  if (material === undefined || o2_percent === undefined || pressure_kpa === undefined ||
      airflow_cm_s === undefined || gravity_g === undefined) return null;
  return { material, o2_percent, pressure_kpa, airflow_cm_s, gravity_g };
}

export const useStore = create<State>((set, get) => {
  function call(slice: Slice, sc: Scenario, signal: AbortSignal): Promise<unknown> {
    switch (slice) {
      case "prediction": return api.predict(sc, signal);
      case "heatmap": return api.heatmap({ material: sc.material, pressure_kpa: sc.pressure_kpa, gravity_g: sc.gravity_g }, signal);
      case "passport": return api.passport({ o2_percent: sc.o2_percent, pressure_kpa: sc.pressure_kpa, airflow_cm_s: sc.airflow_cm_s, gravity_g: sc.gravity_g }, signal);
      case "compare": return api.compare({ material: sc.material, o2_percent: sc.o2_percent, pressure_kpa: sc.pressure_kpa, airflow_cm_s: sc.airflow_cm_s }, signal);
      case "insights": return api.insights(sc, signal);
    }
  }

  async function run(slice: Slice) {
    const sc = scenarioOf(get());
    if (!sc) return;
    controllers[slice]?.abort();
    const ctrl = new AbortController();
    controllers[slice] = ctrl;
    const requestId = get()[slice].requestId + 1;
    // keep previous data while refetching (stale-while-revalidate)
    set({ [slice]: { ...get()[slice], status: "loading", requestId } } as Partial<State>);
    try {
      const data = await call(slice, sc, ctrl.signal);
      if (get()[slice].requestId !== requestId) return; // I-19 stale guard
      delete warmupStart[slice];
      set({ [slice]: { status: "ready", data, error: null, requestId } } as Partial<State>);
    } catch (e) {
      if (isAbort(e) || get()[slice].requestId !== requestId) return;
      const err = toErr(e);
      if (err.code === "MODEL_NOT_READY") {
        const start = (warmupStart[slice] ??= Date.now());
        if (Date.now() - start < WARMUP_MAX_MS) {
          set({ [slice]: { ...get()[slice], warming: true } } as Partial<State>);
          timers[slice] = setTimeout(() => run(slice), WARMUP_RETRY_MS);
          return;
        }
      }
      delete warmupStart[slice];
      set({ [slice]: { ...get()[slice], status: "error", error: err, warming: false } } as Partial<State>);
    }
  }

  function schedule(slice: Slice, delay = DEBOUNCE_MS[slice]) {
    clearTimeout(timers[slice]);
    timers[slice] = setTimeout(() => run(slice), delay);
  }

  async function loadMeta() {
    set({ meta: { ...get().meta, status: "loading" } });
    // 05 §3: retry with backoff while the backend comes up. Free hosting sleeps when idle and needs up to a minute
    // to wake, so keep trying for WAKE_MAX_MS (the header shows a "waking up" message meanwhile) before erroring.
    const t0 = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const meta = await api.meta();
        set({ meta: { status: "ready", data: meta, error: null, requestId: get().meta.requestId + 1 } });
        return meta;
      } catch (e) {
        if (Date.now() - t0 > WAKE_MAX_MS) {
          set({ meta: { ...get().meta, status: "error", error: toErr(e) } });
          return null;
        }
        await new Promise((r) => setTimeout(r, Math.min(3000, 500 * 2 ** attempt)));
      }
    }
  }

  async function loadRuns() {
    controllers.runs?.abort();
    const ctrl = new AbortController();
    controllers.runs = ctrl;
    set({ runs: { ...get().runs, status: "loading" } });
    try {
      const data = await api.runs({}, ctrl.signal);
      set({ runs: { status: "ready", data, error: null, requestId: get().runs.requestId + 1 } });
    } catch (e) {
      if (!isAbort(e)) set({ runs: { ...get().runs, status: "error", error: toErr(e) } });
    }
  }

  function fetchAll(delay?: number) {
    (Object.keys(DEPS) as Slice[]).forEach((s) => schedule(s, delay));
  }

  return {
    vehicle_id: null,
    mode: "explore",
    meta: idle(),
    runs: idle(),
    prediction: idle(),
    heatmap: idle(),
    compare: idle(),
    passport: idle(),
    insights: idle(),
    selectedRunId: null,
    chatOpen: false,
    chatQuestion: null,
    aboutOpen: false,

    async init() {
      const st = get().meta.status;
      if (st === "loading" || st === "ready") return; // StrictMode double-effect guard; retry() comes from "error"
      const meta = await loadMeta();
      if (!meta) return;
      // Initial scenario from meta — first preset + first material, never hard-coded numbers (05 §2).
      const v = meta.vehicles[0];
      set({
        material: meta.materials[0]?.id,
        o2_percent: v?.o2_percent ?? meta.ranges.o2_percent.min,
        pressure_kpa: v?.pressure_kpa ?? meta.ranges.pressure_kpa.max,
        airflow_cm_s: v?.airflow_cm_s ?? meta.ranges.airflow_cm_s.min,
        gravity_g: v?.gravity_g ?? meta.ranges.gravity_g.min,
        vehicle_id: v?.id ?? null,
      });
      loadRuns();
      fetchAll(0);
    },

    setScenario(patch) {
      const prev = get();
      const changed = (Object.keys(patch) as Key[]).filter((k) => patch[k] !== prev[k]);
      if (!changed.length) return;
      const numericEdit = changed.some((k) => k !== "material");
      set({ ...patch, vehicle_id: numericEdit ? null : prev.vehicle_id });
      (Object.keys(DEPS) as Slice[]).forEach((s) => {
        if (DEPS[s].some((k) => changed.includes(k))) schedule(s);
      });
    },

    applyVehicle(id) {
      const v = get().meta.data?.vehicles.find((x) => x.id === id);
      if (!v) return;
      // one store update → one debounced fetch per slice (05 §5); material is kept
      get().setScenario({ o2_percent: v.o2_percent, pressure_kpa: v.pressure_kpa,
        airflow_cm_s: v.airflow_cm_s, gravity_g: v.gravity_g });
      set({ vehicle_id: id });
    },

    retry(slice) {
      if (slice === "meta") void get().init();
      else if (slice === "runs") void loadRuns();
      else { delete warmupStart[slice]; schedule(slice, 0); }
    },

    selectRun: (id) => set({ selectedRunId: id }),
    setChatOpen: (open) => set({ chatOpen: open }),
    askNova: (question) => set({ chatOpen: true, chatQuestion: question }),
    clearChatQuestion: () => set({ chatQuestion: null }),
    setAboutOpen: (open) => set({ aboutOpen: open }),
    setMode: (mode) => set({ mode }),
  };
});
