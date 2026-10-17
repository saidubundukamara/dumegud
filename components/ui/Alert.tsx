import { CheckCircleIcon, InfoIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

type Tone = "success" | "danger" | "warning" | "info";

const TONES: Record<Tone, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  success: { box: "bg-success-surface", icon: "text-success", Icon: CheckCircleIcon },
  danger: { box: "bg-danger-surface", icon: "text-danger", Icon: WarningCircleIcon },
  warning: { box: "bg-warning-surface", icon: "text-warning", Icon: WarningIcon },
  info: { box: "bg-surface-muted", icon: "text-muted", Icon: InfoIcon },
};

/**
 * Message box. Tone is always carried by an icon as well as colour. Errors are announced
 * immediately (role=alert); everything else politely.
 */
export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-brand px-4 py-3.5 ${box}`}>
      <Icon aria-hidden="true" weight="fill" className={`mt-0.5 size-5 shrink-0 ${icon}`} />
      <div className="min-w-0 flex-1 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4">{children}</div>
    </div>
  );
}
