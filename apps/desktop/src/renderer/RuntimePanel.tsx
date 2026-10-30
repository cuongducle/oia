import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeEvent, RuntimeSnapshot } from "../shared/bridge.js";
import type { RuntimeModeChoice } from "../shared/ipc.js";
import { oia } from "./lib/bridge.js";
import { runtimeViewModel, installPhaseText, runtimeErrorText, type RuntimeAction } from "./runtime-panel.js";

/**
 * TP-D3 — the Codex runtime panel (diagnostics + zero-terminal onboarding):
 * status → guided checksummed install → in-app ChatGPT login → provider-mode switch.
 * Every long flow streams progress over onRuntimeEvent; nothing here touches Node.
 * UI copy is English per Q11; concurrency is ONE busyRef (state renders, the ref guards).
 */

interface Props {
  /** The shell re-reads provider status when the effective mode may have changed. */
  onModeChanged?: () => void;
}

export default function RuntimePanel({ onModeChanged }: Props) {
  const [snap, setSnap] = useState<RuntimeSnapshot | null>(null);
  const [busy, setBusy] = useState<RuntimeAction | "mode" | null>(null);
  const [installText, setInstallText] = useState<string | null>(null);
  const [loginNote, setLoginNote] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const onModeChangedRef = useRef(onModeChanged);
  useEffect(() => {
    onModeChangedRef.current = onModeChanged;
  }, [onModeChanged]);

  const refresh = useCallback(async () => {
    try {
      setSnap(await oia().runtimeStatus());
    } catch {
      /* panel is diagnostics — never blocks the composer */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = oia().onRuntimeEvent((ev: RuntimeEvent) => {
      if (ev.type === "install") setInstallText(installPhaseText(ev.phase, ev.pct));
      if (ev.type === "login-url") {
        setLoginUrl(ev.url);
        setLoginNote("Opening the browser to sign in — come back here once you're done.");
      }
      if (ev.type === "login-phase" && ev.phase === "starting") setLoginNote("Starting sign-in…");
    });
    return off;
  }, [refresh]);

  /** The single action runner — ref-guarded, so double clicks and IPC races dead-end here. */
  const run = useCallback(async (label: RuntimeAction | "mode", fn: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(runtimeErrorText(e));
    } finally {
      busyRef.current = false;
      setBusy(null);
      setInstallText(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await refresh();
    onModeChangedRef.current?.();
  }, [refresh]);

  const act = (action: RuntimeAction) =>
    run(action, async () => {
      if (action === "install") {
        setLoginNote(null);
        await oia().runtimeInstall();
      } else if (action === "login") {
        setLoginUrl(null);
        setLoginNote("Waiting for you to finish signing in in the browser…");
        await oia().runtimeLogin();
      } else if (action === "logout") {
        await oia().runtimeLogout();
      } else if (action === "enableReal") {
        await oia().runtimeSetMode("codex");
      }
      await refreshAll();
    });

  const chooseMode = (mode: RuntimeModeChoice) =>
    run("mode", async () => {
      setSnap(await oia().runtimeSetMode(mode));
      onModeChangedRef.current?.();
    });

  const cancel = () =>
    run("install", async () => {
      await oia().runtimeCancel();
    });

  if (!snap) return null;
  const vm = runtimeViewModel(snap.runtime, snap.providersMode, snap.effective);
  const labels: Record<RuntimeAction, string> = {
    install: "Install Codex",
    login: "Sign in with ChatGPT",
    logout: "Sign out",
    enableReal: "Use real Codex",
  };
  const cancellable = busy === "install" || busy === "login";

  return (
    <section className="runtimePanel" aria-label="Codex runtime">
      <div className="runtimeRow">
        <span className={`dot ${vm.badge}`} aria-hidden="true" />
        <span className="runtimeHead">
          <strong>{vm.headline}</strong>
          {vm.detail && <span className="runtimeDetail"> · {vm.detail}</span>}
        </span>
        <span className="spacer" />
        <div className="seg" role="radiogroup" aria-label="Provider mode">
          {(["auto", "codex", "mock"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={snap.providersMode === m}
              className={`segBtn ${snap.providersMode === m ? "on" : ""}`}
              disabled={busy !== null}
              onClick={() => chooseMode(m)}
              title={m === "auto" ? "Automatic: use Codex once you installed/signed in via the app, otherwise trial mode" : m === "codex" ? "Always use Codex (billed against your ChatGPT plan)" : "Trial mode — no quota used"}
            >
              {m === "auto" ? "Auto" : m === "codex" ? "Codex" : "Trial"}
            </button>
          ))}
        </div>
      </div>
      {(installText || loginNote) && (
        <div className="runtimeRow progress" role="status">
          <span>{installText ?? loginNote}</span>
          {cancellable && (
            <button type="button" className="runtimeBtn subtle" onClick={cancel} title={busy === "login" ? "Cancel sign-in — note: your previous session may already be cleared; you would need to sign in again" : "Cancel install"}>
              Cancel
            </button>
          )}
        </div>
      )}
      {loginUrl && (
        <div className="runtimeRow progress">
          If the browser did not open, copy this link into it:
          <code className="loginUrl" title={loginUrl}>{loginUrl}</code>
        </div>
      )}
      {error && (
        <div className="runtimeRow error" role="alert">
          {error}
        </div>
      )}
      {vm.actions.length > 0 && (
        <div className="runtimeRow actions">
          {vm.actions.map((a) => (
            <button key={a} type="button" className="runtimeBtn" disabled={busy !== null} onClick={() => act(a)}>
              {busy === a ? "Working…" : labels[a]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
