"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/button-classes";
import { confirmAvatarUpload, removeAvatar, requestAvatarUpload } from "./actions";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/** Uploads go browser → R2 directly (presigned PUT), then the server re-encodes the image. */
export function AvatarUploader({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return setError("Use an image under 2 MB.");

    startTransition(async () => {
      const ticket = await requestAvatarUpload({ contentType: file.type, size: file.size });
      if (!ticket.ok) return setError(ticket.message);
      const put = await fetch(ticket.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(
        () => null,
      );
      if (!put?.ok) return setError("The upload didn't go through. Check your connection and try again.");
      const done = await confirmAvatarUpload(ticket.data.key);
      if (!done.ok) return setError(done.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={80} height={80} unoptimized className="size-20 rounded-full object-cover" />
        ) : (
          <div aria-hidden="true" className="flex size-20 items-center justify-center rounded-full bg-primary-soft text-2xl font-bold text-primary-pressed">
            {displayName.slice(0, 1).toUpperCase() || "?"}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClasses("secondary")}
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            {pending ? "Uploading…" : avatarUrl ? "Change photo" : "Add a photo"}
          </button>
          {avatarUrl ? (
            <button
              type="button"
              className={buttonClasses("ghost")}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await removeAvatar();
                  if (!res.ok) setError(res.message);
                  else router.refresh();
                })
              }
            >
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          className="sr-only"
          aria-label="Profile photo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>
      <p className="text-sm text-muted">JPEG, PNG or WebP, up to 2 MB. We crop it to a square.</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
