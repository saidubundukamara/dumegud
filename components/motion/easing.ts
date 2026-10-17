// Mirrors the CSS tokens in styles/tokens.css so JS and CSS motion feel the same.
export const EASE_OUT = [0.32, 0.72, 0, 1] as const;
export const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 220, damping: 28 } as const;
