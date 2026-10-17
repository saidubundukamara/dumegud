import type { ReactNode } from "react";
import { PageGlow, PublicHeader } from "@/components/public/PublicHeader";

type Tone = "primary" | "success" | "neutral";

const TONES: Record<Tone, string> = {
  primary: "bg-primary text-white shadow-primary",
  success: "bg-success text-white",
  neutral: "bg-surface text-text shadow-soft ring-1 ring-border",
};

/** Page frame for the screens fans land on after checkout (and other one-message pages). */
export function StatusPage({ children, align = "center" }: { children: ReactNode; align?: "center" | "top" }) {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col">
      <PageGlow />
      <PublicHeader cta={false} />
      <main
        className={`relative mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-20 sm:px-6 ${align === "center" ? "justify-center pt-10" : "pt-10 sm:pt-16"}`}
      >
        {children}
      </main>
    </div>
  );
}

/** Icon badge + heading + body. `decoration` renders behind the icon (e.g. confetti). */
export function StatusBlock({
  icon,
  tone = "neutral",
  title,
  children,
  decoration,
  pulse = false,
}: {
  icon: ReactNode;
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  decoration?: ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="flex animate-rise flex-col items-center gap-5 text-center">
      <div className="relative flex size-20 items-center justify-center">
        {decoration}
        {pulse ? <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/15" /> : null}
        <span aria-hidden="true" className={`relative flex size-20 items-center justify-center rounded-full ${TONES[tone]}`}>
          {icon}
        </span>
      </div>
      <h1 className="text-title">{title}</h1>
      {children ? <div className="flex w-full flex-col items-center gap-4 text-lg text-muted">{children}</div> : null}
    </div>
  );
}
