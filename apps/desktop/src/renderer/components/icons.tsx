/**
 * UI v1.1, the ONE icon set for app chrome (visual system v2: 1.7px stroke,
 * rounded joins, 18-20px). Views import from here instead of drawing their own.
 */
const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icons = {
  plus: <svg width="16" height="16" viewBox="0 0 24 24" {...s} strokeWidth={2} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  home: <svg width="18" height="18" viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></svg>,
  projects: <svg width="18" height="18" viewBox="0 0 24 24" {...s} aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>,
  templates: <svg width="18" height="18" viewBox="0 0 24 24" {...s} aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16M10 10v10" /></svg>,
  tools: <svg width="18" height="18" viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="m14 6 4 4M5 19l9.5-9.5M14.5 4.5l5 5-2 2-5-5z" /></svg>,
  brand: <svg width="18" height="18" viewBox="0 0 24 24" {...s} aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="9" cy="10" r="1.2" fill="currentColor" /><circle cx="12" cy="8" r="1.2" fill="currentColor" /><circle cx="15" cy="10" r="1.2" fill="currentColor" /></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  sparkle: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" /></svg>,
  code: <svg width="20" height="20" viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 6l-3 12" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" {...s} strokeWidth={2.2} aria-hidden="true"><path d="M5 12.5 10 17l9-10" /></svg>,
};
