import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import type { ChatEvent, CanvasMsgMeta } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";
import { presentError } from "@oia-web/libs/provider-errors";
import { t } from "@oia-web/libs/i18n";
import type { OiaBridge } from "../shared/bridge.js";
import { mapAssetUrls } from "../shared/assets.js";

/**
 * D2 renderer scaffold — the banner Home flow over the typed IPC bridge (mock pair by
 * default; the same UI runs against codex when the env selects it). Strings reuse the
 * web app's single source (@oia-web/libs) — no copies. The full renderer port (editor,
 * templates, studio polish) is the next D2 increment; this scaffold proves the shell
 * end to end: prompt → IPC chat stream → timeline → asset-referenced canvas preview.
 */

const oia = () => (window as unknown as { oia: OiaBridge }).oia;

/** Seller strings ship Vietnamese-first by design (Stage-0 decision). */
const tt = (key: Parameters<typeof t>[1]) => t("en", key);

/** A renderer crash must never be a white window for a non-technical seller. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main className="appShell">
          <div className="notice error" role="alert">
            Ứng dụng gặp lỗi hiển thị. Hãy mở lại cửa sổ và thử lại — công việc của bạn đã được lưu.
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
export { ErrorBoundary };


export default function App() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{ content: string; done: boolean }[]>([]);
  const [narrative, setNarrative] = useState("");
  const [canvasMeta, setCanvasMeta] = useState<CanvasMsgMeta | null>(null);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<ReturnType<typeof presentError> | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [quota, setQuota] = useState<{ planner: number; image: number } | null>(null);
  const [editableText, setEditableText] = useState(true); // "Chữ sửa được ngay" — clean-plate default
  const activeJobRef = useRef<string | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const offRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void oia()
      .providerStatus()
      .then((s) => {
        setMockMode(s.image.capabilities.isMock);
        setQuota(s.quota);
      })
      .catch(() => {});
    // chat events stream over the bridge subscription
    // events filtered to the ACTIVE job — a concurrent mock run cannot interleave
    offRef.current = oia().onChatEvent((ev) => {
      if (activeJobRef.current && ev.jobId && ev.jobId !== activeJobRef.current) return;
      if (ev.jobId) {
        activeJobRef.current ??= ev.jobId;
        setJobId(ev.jobId);
      }
      if (ev.status === "cancelled") {
        setError(tt("error.cancelled"));
        return;
      }
      if (ev.error) {
        const p = presentError(ev.errorClass);
        setErrorAction(p);
        setError(ev.resetAt ? `${tt(p.messageKey)} (${tt("error.resetAt").replace("{time}", ev.resetAt)})` : tt(p.messageKey));
      }
      if (ev.renderData?.taskMeta?.length) {
        setTimeline(ev.renderData.taskMeta.map((tm) => ({ content: tm.content, done: tm.status === "1" })));
      }
      if (ev.content) setNarrative((n) => n + stripMarkers(ev.content) + " ");
      for (const m of ev.renderData?.msgMeta ?? []) if (m.type === "canvas") setCanvasMeta(m);
    });
    return () => offRef.current?.();
  }, []);

  // canvas preview — same fabric wrapper the web Home uses (@oia/canvas)
  useEffect(() => {
    let cancelled = false;
    if (!canvasMeta) return;
    void (async () => {
      const { createEditor } = await import("@oia/canvas");
      if (cancelled || !canvasElRef.current) return;
      const c = (fabricRef.current ?? (await createEditor(canvasElRef.current))) as import("fabric").Canvas;
      if (cancelled) return;
      fabricRef.current = c;
      await c.loadFromJSON(mapAssetUrls(canvasMeta.canvas));
      const clip = canvasMeta.canvas.objects.find((o) => o.name === "clip");
      const w = clip?.width || 1360;
      const h = clip?.height || 2048;
      c.setDimensions({ width: 520, height: Math.round((520 * h) / w) });
      c.setZoom(520 / w);
      c.requestRenderAll();
    })().catch((e) => setError(`The design could not be loaded: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
    };
  }, [canvasMeta]);
  useEffect(() => () => void fabricRef.current?.dispose(), []);

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    activeJobRef.current = null;
    setError("");
    setErrorAction(null);
    setTimeline([]);
    setNarrative("");
    setCanvasMeta(null);
    try {
      await oia().chatRun({ prompt, ...(editableText ? { mode: "clean-plate" as const } : {}) });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "IpcValidationError") setError(tt("error.invalidRequest"));
      else if (name === "ProviderConfigError") setError(tt("error.configMismatch"));
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      void oia()
        .providerStatus()
        .then((s) => setQuota(s.quota))
        .catch(() => {});
    }
  }
  async function stop() {
    if (jobId) await oia().cancelChat(jobId).catch(() => {});
    // the server emits the terminal cancelled event and closes — do not abort locally
  }

  return (
    <main className="appShell">
      <div className="topline">
        <span>Oia — Studio (desktop shell D2)</span>
        <span>{quota ? `🪙 ${quota.image} ảnh · ${quota.planner} lượt đọc` : ""}</span>
      </div>
      <h1>Từ một ý tưởng đến banner đẹp.</h1>
      <p className="sub">Mô tả banner bằng một câu — chữ sửa được ngay, xuất khung sàn.</p>

      {mockMode && <div className="notice warn" role="status">{tt("provider.mockBanner")}</div>}

      <section className="composer">
        <textarea
          aria-label="Design idea"
          value={prompt}
          placeholder="VD: banner trà sữa giảm 20% ngày 8/11"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composerRow">
          <button type="button" className={`switch ${editableText ? "on" : ""}`} aria-label={tt("mode.toggle")} onClick={() => setEditableText(!editableText)} />
          <span className="toggle" onClick={() => setEditableText(!editableText)}>{tt("mode.toggle")}</span>
          <span className="spacer" />
          {busy ? (
            <button className="generate stop" aria-label={tt("editor.stop")} title={tt("editor.stop")} onClick={() => void stop()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="#fff" /></svg>
            </button>
          ) : (
            <button className="generate" aria-label="Generate" disabled={!prompt.trim()} onClick={() => void submit()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="notice error" role="alert">
          {error}
          {errorAction && errorAction.actionKind === "retry" && (
            <>
              {" · "}
              <button onClick={() => void submit()} style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", font: "inherit" }}>
                {tt(errorAction.actionLabelKey!)}
              </button>
            </>
          )}
        </div>
      )}

      {timeline.length > 0 && (
        <div className="timeline">
          {timeline.map((tl) => (
            <div key={tl.content} className={`tl ${tl.done ? "done" : ""}`}>
              {tl.content} {tl.done ? "· xong" : "· đang chạy…"}
            </div>
          ))}
        </div>
      )}
      {narrative && <div className="narrative">{narrative.trim()}</div>}

      {canvasMeta && (
        <section className="result">
          <div className="canvasWrap">
            <canvas ref={canvasElRef} />
          </div>
          <p className="status">Bản xem trước — mở trình chỉnh sửa đầy đủ ở bước kế tiếp của D2.</p>
        </section>
      )}
    </main>
  );
}
