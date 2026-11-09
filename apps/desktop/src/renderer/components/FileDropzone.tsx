import { useEffect, useId, useState, type DragEvent, type RefObject } from "react";
import { acceptsFile, formatBytes } from "../lib/file-accept.js";

/**
 * The Tools file picker: a drop area that turns into a preview card once a file is
 * chosen. The native <input type=file> stays mounted (hidden) and stays the source of
 * truth, the tool runners read `inputRef.current.files[0]` exactly as before.
 */

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  /** Short human list shown under the title, e.g. "PNG or JPG". */
  formats: string;
  label: string;
  disabled?: boolean;
  onChange?: (file: File | null) => void;
}

/** Chromium cannot decode HEIC or render PDFs in <img>: those get a type badge instead. */
function previewable(file: File): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|avif)$/i.test(file.type);
}

function extensionOf(file: File): string {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  return ext ? ext.toUpperCase().slice(0, 4) : "FILE";
}

export function FileDropzone({ inputRef, accept, formats, label, disabled, onChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState("");
  const inputId = useId();

  useEffect(() => {
    if (!file || !previewable(file)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(next: File | null) {
    setFile(next);
    setDims(null);
    setRejected("");
    onChange?.(next);
  }

  function browse() {
    if (!disabled) inputRef.current?.click();
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    choose(null);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    if (!acceptsFile(accept, dropped)) {
      setRejected(`“${dropped.name}” is not a supported file. Use ${formats}.`);
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(dropped);
    if (inputRef.current) inputRef.current.files = dt.files;
    choose(dropped);
  }

  const dragProps = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); if (!disabled) setDragging(true); },
    onDragOver: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = disabled ? "none" : "copy"; },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      const to = e.relatedTarget;
      if (!(to instanceof Node) || !e.currentTarget.contains(to)) setDragging(false);
    },
    onDrop,
  };

  return (
    <div className="fileDropzoneWrap">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        hidden
        aria-label={label}
        // a cancelled dialog can clear the input: the card mirrors the input, never a stale file
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className={`fileDropzone filled ${dragging ? "dragging" : ""}`} data-testid="file-dropzone" {...dragProps}>
          <div className="fileThumb" aria-hidden="true">
            {previewUrl ? (
              <img src={previewUrl} alt="" onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
            ) : (
              <span className="fileBadge">{extensionOf(file)}</span>
            )}
          </div>
          <div className="fileMeta">
            <strong className="fileName" title={file.name}>{file.name}</strong>
            <span className="fileFacts">
              {formatBytes(file.size)}
              {dims && <> · {dims.w} × {dims.h}px</>}
            </span>
            <span className="fileActions">
              <button type="button" className="fileLinkBtn" onClick={browse} disabled={disabled}>Replace</button>
              <button type="button" className="fileLinkBtn subtle" onClick={clear} disabled={disabled}>Remove</button>
            </span>
          </div>
          {dragging && <div className="fileDropOverlay">Drop to replace</div>}
        </div>
      ) : (
        <div
          className={`fileDropzone empty ${dragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
          data-testid="file-dropzone"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${label}: drop a file or browse`}
          aria-disabled={disabled}
          onClick={browse}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); browse(); } }}
          {...dragProps}
        >
          <span className="fileDropIcon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
              <circle cx="9" cy="9.5" r="1.6" />
              <path d="m20.5 15.5-4.2-4.2a1.5 1.5 0 0 0-2.1 0L5 20.5" />
            </svg>
          </span>
          <span className="fileDropTitle">
            {dragging ? "Drop it here" : <>Drop a file here or <span className="fileDropBrowse">browse</span></>}
          </span>
          <span className="fileDropHint">{formats}</span>
        </div>
      )}
      {rejected && <p className="fileDropReject" role="alert">{rejected}</p>}
    </div>
  );
}
