// I-22: a render exception in one panel never takes down another.
import { Component, type ReactNode } from "react";

interface Props { name: string; children: ReactNode }
interface State { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(`[${this.props.name}] render error`, err);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full flex-col items-start gap-2 p-4 text-sm">
          <span className="text-danger">This panel hit an error.</span>
          <button className="rounded border border-border px-2 py-1 text-xs hover:bg-white/5"
            onClick={() => this.setState({ failed: false })}>Reload panel</button>
        </div>
      );
    }
    return this.props.children;
  }
}
