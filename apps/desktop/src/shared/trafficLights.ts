/**
 * T1 chrome (macos-design-2026.md) — the traffic-light geometry is ONE contract
 * shared by two processes: main positions the lights (trafficLightPosition.x),
 * the renderer pads the top bars around them (--traffic-inset, set by preload).
 * A second copy of these numbers anywhere else is a drift bug the shot gate
 * (chrome verify) exists to catch.
 */
export const TRAFFIC_LIGHTS = {
  /** x of the close button, in CSS px from the window's left edge (main-side). */
  x: 20,
  /** Left inset the top bars reserve for the whole light cluster + margin (CSS px). */
  insetPx: 92,
} as const;
