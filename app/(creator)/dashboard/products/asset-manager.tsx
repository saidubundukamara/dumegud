"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/button-classes";
import type { AssetDTO } from "@/server/services/ProductService";
import { confirmProductUpload, deleteProductAsset, requestProductUpload } from "./actions";

const STATUS: Record<AssetDTO["status"], string> = {
  uploading: "Upload incomplete",
  pending: "Waiting for review",
  clean: "Approved",
  rejected: "Rejected",
};

/** Files go browser → R2 directly (presigned PUT); the server then checks what arrived. */
export function AssetManager({
  productId,
  kind,
  assets,
  filesLocked,
  accept,
}: {
  productId: string;
  kind: "file" | "preview_image";
  assets: AssetDTO[];
  filesLocked: boolean;
  accept: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    startTransition(async () => {
      setProgress(`Uploading ${file.name}…`);
      const ticket = await requestProductUpload({ productId, kind, filename: file.name, size: file.size });
      if (!ticket.ok) {
        setProgress(null);
        return setError(ticket.message);
      }
      const put = await fetch(ticket.data.url, { method: "PUT", headers: { "Content-Type": ticket.data.contentType }, body: file }).catch(() => null);
      if (!put?.ok) {
        setProgress(null);
        return setError("The upload didn't go through. Check your connection and try again.");
      }
      setProgress("Checking the file…");
      const done = await confirmProductUpload(ticket.data.assetId);
      setProgress(null);
      if (!done.ok) setError(done.message);
      router.refresh();
    });
  }

  const visible = assets.filter((a) => a.kind === kind && a.status !== "uploading");
  return (
    <div className="flex flex-col gap-3">
      {visible.length ? (
        <ul className="flex flex-col gap-2">
          {visible.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-border p-3">
              <span className="flex items-center gap-3">
                {a.url ? <Image src={a.url} alt="" width={48} height={48} unoptimized className="size-12 rounded object-cover" /> : null}
                <span>
                  <span className="block font-semibold">{a.filename}</span>
                  <span className="text-sm text-muted">{STATUS[a.status]}</span>
                </span>
              </span>
              {kind === "preview_image" || !filesLocked ? (
                <button
                  type="button"
                  className={buttonClasses("ghost")}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteProductAsset(a.id);
                      if (!res.ok) setError(res.message);
                      router.refresh();
                    })
                  }
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={buttonClasses("secondary", "self-start")} disabled={pending} onClick={() => input.current?.click()}>
        {kind === "file" ? "Upload a file" : "Add a preview image"}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={kind === "file" ? "Product file" : "Preview image"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {progress ? <p role="status" className="text-sm text-muted">{progress}</p> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
