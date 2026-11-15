// Every panel: title + the four states (05 §4) — loading skeleton, refetching line, error chip w/ Retry, empty.
import type { ReactNode } from "react";
import type { Async } from "../../store/useStore";
import { ErrorBoundary } from "./ErrorBoundary";

interface Props<T> {
  title: string;
  subtitle?: string;
  state?: Async<T>;
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  onRetry?: () => void;
  right?: ReactNode;
  className?: string;
  bare?: boolean; // no glass frame or header — the section supplies its own
  children: (data: T) => ReactNode;
}

export function PanelShell<T>({ title, subtitle, state, skeleton, isEmpty, empty, onRetry, right, className = "", bare = false, children }: Props<T>) {
  const data = state?.data ?? null;
  const refetching = state?.status === "loading" && data !== null;
  const errored = state?.status === "error";
  return (
    <section className={`${bare ? "" : "glass rounded-2xl"} relative flex flex-col overflow-hidden ${className}`}>
      {refetching && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="progress-line h-full w-1/3 bg-cool/70" />
        </div>
      )}
      {!bare && <header className="flex items-start justify-between gap-3 px-6 pt-5">
        <div>
          <h3 className="num text-[13px] font-semibold uppercase tracking-wider text-text">{title}</h3>
          {subtitle && <p className="num mt-0.5 text-[11px] uppercase tracking-wider text-dim">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {state?.warming && <span className="num text-xs text-fire">Model warming up…</span>}
          {right}
        </div>
      </header>}
      <div className={`relative flex-1 ${bare ? "" : "px-6 pb-6 pt-4"}`}>
        <ErrorBoundary name={title}>
          {data === null ? (
            errored ? <ErrorChip message={state?.error?.message} onRetry={onRetry} /> : (skeleton ?? <DefaultSkeleton />)
          ) : (
            <>
              {errored && <div className="mb-3"><ErrorChip message={state?.error?.message} onRetry={onRetry} /></div>}
              <div className={errored ? "opacity-50" : ""}>
                {isEmpty?.(data) ? (empty ?? <p className="text-sm text-dim">Nothing to show.</p>) : children(data)}
              </div>
            </>
          )}
        </ErrorBoundary>
      </div>
    </section>
  );
}

export function ErrorChip({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="inline-flex items-center gap-3 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-sm">
      <span>{message ?? "Request failed"}</span>
      {onRetry && (
        <button className="num rounded border border-white/20 px-2 py-0.5 text-xs uppercase tracking-wider hover:bg-white/10" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-4 w-1/2" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
