import type { ReactNode } from "react";

/**
 * The generation result, presented as a design artifact — not a chat message.
 * Name + pixel dims badge + primary "Open in editor"; secondary actions muted.
 * (gap-table P0 presentation, docs/reference/design-product-ui-2026.md)
 */
export function ResultCard(props: {
  name: string;
  w: number;
  h: number;
  ready: boolean;
  canvasRef: React.Ref<HTMLCanvasElement>;
  actions: ReactNode;
  /** DA-6 — "auto-refined · round N" when a refine round actually ran. */
  badge?: string | null;
}) {
  const { name, w, h, ready, canvasRef, actions, badge } = props;
  return (
    <section className="result" aria-label="Your design" data-testid="home-result">
      <div className="resultCard">
        <div className="resultHead">
          <div className="resultTitle">
            <strong>{name.replace(/^./, (c) => c.toUpperCase())}</strong>
            <span className="resultDims">{w} × {h} px</span>
          </div>
          {ready && <span className="resultBadge">Ready</span>}
          {badge && <span className="resultBadge autoRefined" data-testid="auto-refined-badge">{badge}</span>}
        </div>
        <div className="canvasWrap">
          <canvas ref={canvasRef} />
        </div>
        <div className="resultActions">{actions}</div>
      </div>
    </section>
  );
}
