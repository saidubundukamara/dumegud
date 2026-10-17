import type { ReactNode } from "react";
import { PhotoSlot } from "./PhotoSlot";

/** A phone drawn in CSS. Decorative: the real content it imitates lives on every creator page. */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative mx-auto w-[17.5rem] rounded-[3rem] bg-accent p-2.5 shadow-[0_40px_80px_-30px_rgb(26_21_20/0.45)] ring-1 ring-black/40 ${className}`}
    >
      <div className="relative overflow-hidden rounded-[2.4rem] bg-background">
        <div className="absolute left-1/2 top-2.5 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-accent" />
        {children}
      </div>
    </div>
  );
}

/** A sample creator page, matching the real layout of /[handle]. */
export function SampleCreatorScreen() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-12 text-center">
      <PhotoSlot slot="heroCreator" className="size-20 rounded-full ring-4 ring-surface" sizes="80px" />
      <div>
        <p className="font-display text-xl font-bold tracking-tight">Aminata K.</p>
        <p className="text-xs text-muted">@aminata · Singer</p>
      </div>
      <p className="text-[0.8rem] leading-snug text-muted">New songs every Friday. Thank you for helping me make more music!</p>
      <div className="mt-1 w-full rounded-[1.4rem] bg-surface p-3 shadow-soft ring-1 ring-border">
        <p className="mb-2 text-left text-xs font-semibold">Send Aminata a gift</p>
        <div className="grid grid-cols-3 gap-1.5">
          {["Le 20", "Le 50", "Le 100"].map((a) => (
            <span
              key={a}
              className={`rounded-full py-2 text-sm font-semibold ${a === "Le 50" ? "bg-primary-soft text-primary-pressed ring-2 ring-primary" : "bg-surface-muted"}`}
            >
              {a}
            </span>
          ))}
        </div>
        <span className="mt-2.5 flex h-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
          Send Le 50
        </span>
        <p className="mt-2 text-[0.65rem] text-muted">Orange Money · Afrimoney</p>
      </div>
    </div>
  );
}

/** Floating "you got paid" card used next to the phone. */
export function PaidNotification({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex w-64 items-center gap-3 rounded-[1.25rem] bg-surface/95 p-3 shadow-lift ring-1 ring-border backdrop-blur ${className}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-white">
        D
      </span>
      <div className="min-w-0 text-left">
        <p className="text-sm font-semibold">You got Le 50</p>
        <p className="truncate text-xs text-muted">Mohamed: &quot;This song made my day!&quot;</p>
      </div>
    </div>
  );
}
