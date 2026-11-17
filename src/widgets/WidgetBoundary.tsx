import { Component, type ReactNode, type SyntheticEvent } from "react";
import { HTMLContainer } from "tldraw";

import "./widgets.css";

// GT-1: one broken widget never breaks the page. tldraw 5.5.2 already puts
// every shape in an error boundary (Shape.tsx, OptionalErrorBoundary), but
// its fallback is an empty grey box that says only "Error". Each widget
// (board, map, Slate, web embed) wraps its own body in this boundary
// instead, so a failure shows which widget broke, with a "Try again"; the
// shape itself stays a normal tldraw shape (select, drag, resize, delete),
// and everything else on the whiteboard keeps working. `ShapeFailed` is
// also tldraw's ShapeErrorFallback (Whiteboard.tsx) for any other shape.

export type WidgetKind = "board" | "map" | "slate" | "embed";

const NAMES: Record<WidgetKind, string> = { board: "Board", map: "Map", slate: "Slate", embed: "Web embed" };

/** Test hook (e2e/widgetfail.e2e.ts): the widget kinds listed in
    `window.__gkFailWidgets` throw while rendering, as a real bug would. */
function FailForTest({ kind }: { kind: WidgetKind }) {
  const list = (globalThis as { __gkFailWidgets?: unknown }).__gkFailWidgets;
  if (Array.isArray(list) && list.includes(kind)) throw new Error(`Test failure in the ${kind} widget`);
  return null;
}

/** Presses on the box's button are its own (not a selection on the canvas). */
const own = (e: SyntheticEvent) => e.stopPropagation();

export function ShapeFailed({ kind, onRetry }: { kind?: WidgetKind; error?: unknown; onRetry?: () => void }) {
  return (
    <HTMLContainer className="gw-failed" style={{ pointerEvents: "none" }} data-testid="widget-failed" data-kind={kind ?? "shape"}>
      <div className="gw-failed__box">
        <span className="gw-failed__text">{kind ? `This ${NAMES[kind].toLowerCase()} widget failed` : "This item failed"}</span>
        {onRetry && (
          <button type="button" className="gw-failed__retry" data-testid="widget-retry" onPointerDown={own} onPointerUp={own} onClick={(e) => { own(e); onRetry(); }}>
            Try again
          </button>
        )}
      </div>
    </HTMLContainer>
  );
}

type Props = { kind: WidgetKind; children: ReactNode };

export class WidgetBoundary extends Component<Props, { error: unknown; attempt: number }> {
  override state = { error: null as unknown, attempt: 0 };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error("Widget failed") };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[gauntlet] The ${this.props.kind} widget failed:`, error);
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  override render() {
    if (this.state.error !== null) return <ShapeFailed kind={this.props.kind} error={this.state.error} onRetry={this.retry} />;
    return (
      <WidgetAttempt key={this.state.attempt}>
        <FailForTest kind={this.props.kind} />
        {this.props.children}
      </WidgetAttempt>
    );
  }
}

/** A fresh mount of the widget on each "Try again". */
function WidgetAttempt({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
