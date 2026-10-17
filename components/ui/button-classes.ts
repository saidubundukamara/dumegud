// Shared by <SubmitButton> and links styled as buttons (usable from Server Components).

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border bg-background text-text hover:bg-surface",
  ghost: "text-text underline-offset-4 hover:underline",
};

export function buttonClasses(variant: ButtonVariant = "primary", className = "") {
  return `inline-flex min-h-12 items-center justify-center gap-2 rounded-brand px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`;
}
