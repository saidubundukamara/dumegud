// Shared by <SubmitButton> and links styled as buttons (usable from Server Components).

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "dark" | "quiet";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover active:bg-primary-pressed",
  secondary: "bg-surface text-text shadow-soft ring-1 ring-border hover:ring-border-strong",
  /** Orange, for the main action on a maroon (brand) surface. Ink text keeps it above 7:1. */
  accent:
    "bg-secondary text-secondary-foreground shadow-[0_10px_24px_-10px_color-mix(in_srgb,var(--color-secondary)_60%,transparent)] hover:bg-secondary-hover",
  dark: "bg-accent text-accent-foreground hover:bg-accent/90",
  quiet: "bg-surface-muted text-text hover:bg-[color-mix(in_srgb,var(--color-surface-muted),black_5%)]",
  ghost: "text-text underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-7 text-[1.0625rem]",
};

/**
 * Pill buttons with a physical press (scale) and the brand ease. 48px minimum height keeps every
 * button above the 44pt HIG touch target.
 */
export function buttonClasses(variant: ButtonVariant = "primary", className = "", size: ButtonSize = "md") {
  return `group/btn inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,box-shadow,transform,translate,scale,color] duration-200 ease-brand active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55 ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

/**
 * The "button-in-button" trailing icon circle; nudges up-right while its button is hovered.
 * Put it last inside a `buttonClasses` element.
 */
export function buttonIconClasses(variant: ButtonVariant = "primary") {
  const tone = variant === "primary" || variant === "dark" ? "bg-white/18" : "bg-text/6";
  return `-mr-2 flex size-8 shrink-0 items-center justify-center rounded-full ${tone} transition-transform duration-300 ease-brand group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-px group-hover/btn:scale-105`;
}
