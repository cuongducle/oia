import { useEffect, useRef, type ReactNode } from "react";

/** Keyboard-safe modal shell — port of the web Dialog (transport-free, no next deps). */
export function Dialog({ children, onClose, labelledBy, label, wide = false }: {
  children: ReactNode; onClose: () => void; labelledBy?: string; label?: string; wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    (focusable()[0] ?? ref.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", key, true); previous?.focus(); };
  }, []);
  return <div className="overlay" onClick={onClose}><section ref={ref} className={`dialog ${wide ? "dialogWide" : ""}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={label} onClick={e=>e.stopPropagation()}>{children}</section></div>;
}
