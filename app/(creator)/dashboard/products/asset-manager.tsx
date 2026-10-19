"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileIcon, ImageIcon, UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui/Alert";
import { StatusChip } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button-classes";
import type { AssetDTO } from "@/server/services/ProductService";
import { confirmProductUpload, deleteProductAsset, requestProductUpload } from "./actions";
import { fileSize } from "./labels";

const STATUS: Record<AssetDTO["status"], { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  uploading: { label: "Upload incomplete", tone: "neutral" },
  pending: { label: "Waiting for review", tone: "warning" },
  clean: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

type Upload = { name: string; percent: number | null; phase: "sending" | "checking" };

/** PUT with progress events (fetch has none); resolves "aborted" when the creator cancels. */
function put(url: string, contentType: string, file: File, xhr: XMLHttpRequest, onProgress: (percent: number) => void) {
  return new Promise<"ok" | "failed" | "aborted">((resolve) => {
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? "ok" : "failed");
    xhr.onerror = () => resolve("failed");
    xhr.onabort = () => resolve("aborted");
    xhr.send(file);
  });
}

/** Files go browser → R2 directly (presigned PUT); the server then checks what arrived. */
export function AssetManager({
  productId,
  kind,
  assets,
  filesLocked,
  accept,
  hint,
}: {
  productId: string;
  kind: "file" | "preview_image";
  assets: AssetDTO[];
  filesLocked: boolean;
  accept: string;
  hint: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = upload !== null || pending;
  const noun = kind === "file" ? "file" : "image";

  async function start(file: File) {
    setError(null);
    setUpload({ name: file.name, percent: 0, phase: "sending" });
    const ticket = await requestProductUpload({ productId, kind, filename: file.name, size: file.size });
    if (!ticket.ok) {
      setUpload(null);
      return setError(ticket.message);
    }
    xhr.current = new XMLHttpRequest();
    const sent = await put(ticket.data.url, ticket.data.contentType, file, xhr.current, (percent) =>
      setUpload((u) => (u ? { ...u, percent } : u)),
    );
    xhr.current = null;
    if (sent !== "ok") {
      setUpload(null);
      if (sent === "failed") setError("The upload didn't go through. Check your connection and try again.");
      return;
    }
    setUpload({ name: file.name, percent: null, phase: "checking" });
    const done = await confirmProductUpload(ticket.data.assetId);
    setUpload(null);
    if (!done.ok) setError(done.message);
    startTransition(() => router.refresh());
  }

  function remove(id: string) {
    setConfirming(null);
    startTransition(async () => {
      const res = await deleteProductAsset(id);
      if (!res.ok) setError(res.message);
      router.refresh();
    });
  }

  const visible = assets.filter((a) => a.kind === kind && a.status !== "uploading");
  return (
    <div className="flex flex-col gap-3">
      {visible.length ? (
        <ul className="flex flex-col gap-2">
          {visible.map((a) => {
            const status = STATUS[a.status];
            const removable = kind === "preview_image" || !filesLocked;
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-brand bg-surface p-3 ring-1 ring-border">
                {a.url ? (
                  <Image src={a.url} alt="" width={56} height={56} unoptimized className="size-14 shrink-0 rounded-brand-sm object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-brand-sm bg-surface-muted text-muted">
                    {kind === "file" ? <FileIcon weight="duotone" className="size-6" /> : <ImageIcon weight="duotone" className="size-6" />}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-semibold">{a.filename}</span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span className="tabular-nums">{fileSize(a.sizeBytes)}</span>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  </span>
                </span>
                {removable && confirming === a.id ? (
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    <button type="button" className={buttonClasses("quiet", "!min-h-10 !px-4 text-danger")} onClick={() => remove(a.id)}>
                      Yes, remove
                    </button>
                    <button type="button" className={buttonClasses("ghost", "!min-h-10 !px-3")} onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : removable ? (
                  <button
                    type="button"
                    className={buttonClasses("ghost", "!min-h-11 shrink-0 !px-3 text-muted hover:text-text")}
                    disabled={busy}
                    aria-label={`Remove ${a.filename}`}
                    onClick={() => setConfirming(a.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {upload ? (
        <div role="status" className="flex flex-col gap-2 rounded-brand bg-surface p-4 ring-1 ring-border">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{upload.name}</span>
            <span className="shrink-0 text-muted tabular-nums">
              {upload.phase === "checking" ? "Checking the file…" : `${upload.percent ?? 0}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full origin-left rounded-full bg-secondary transition-transform duration-300 ease-brand ${upload.phase === "checking" ? "animate-pulse" : ""}`}
              style={{ transform: `scaleX(${upload.phase === "checking" ? 1 : (upload.percent ?? 0) / 100})` }}
            />
          </div>
          {upload.phase === "sending" ? (
            <button type="button" className={buttonClasses("ghost", "!min-h-10 self-start !px-0 text-sm")} onClick={() => xhr.current?.abort()}>
              Cancel upload
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void start(file);
          }}
          className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-brand-lg border-2 border-dashed px-4 py-5 text-center transition-colors duration-200 ease-brand disabled:opacity-55 ${
            dragging ? "border-secondary bg-secondary-soft" : "border-border-strong bg-surface hover:border-primary hover:bg-primary-soft/40"
          }`}
        >
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-secondary-soft text-secondary-foreground">
            <UploadSimpleIcon weight="bold" className="size-5" />
          </span>
          <span className="font-semibold">{visible.length ? `Add another ${noun}` : kind === "file" ? "Upload your file" : "Add a preview image"}</span>
          <span className="text-sm text-muted">{hint}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={kind === "file" ? "Product file" : "Preview image"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void start(file);
        }}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
