// Ready-made colors for a shop's stamp card. Every card color is light and every ink is dark,
// so any pair stays readable: dark text on the card, light text on the ink.

export const CARD_COLORS = {
  canary: { label: "Canary", hex: "#f6de5c" },
  kraft: { label: "Kraft", hex: "#e2c7a0" },
  mint: { label: "Mint", hex: "#bfe6cf" },
  blush: { label: "Blush", hex: "#f6c9cf" },
  sky: { label: "Sky", hex: "#bfdcf2" },
  cream: { label: "Cream", hex: "#f4efe3" },
} as const;

export const INK_COLORS = {
  violet: { label: "Violet", hex: "#4b2f8e" },
  red: { label: "Red", hex: "#a3272d" },
  blue: { label: "Blue", hex: "#1f4e99" },
  green: { label: "Green", hex: "#1d6a44" },
  brown: { label: "Brown", hex: "#5a3420" },
  black: { label: "Black", hex: "#2a1b14" },
} as const;

export type CardColor = keyof typeof CARD_COLORS;
export type InkColor = keyof typeof INK_COLORS;

export const CARD_COLOR_KEYS = Object.keys(CARD_COLORS) as [CardColor, ...CardColor[]];
export const INK_COLOR_KEYS = Object.keys(INK_COLORS) as [InkColor, ...InkColor[]];

/** CSS variables that recolor the stamp card, buttons and barista screen. */
export function themeVars(card: CardColor, ink: InkColor): Record<string, string> {
  const paper = CARD_COLORS[card]?.hex ?? CARD_COLORS.canary.hex;
  const stamp = INK_COLORS[ink]?.hex ?? INK_COLORS.violet.hex;
  return {
    "--bond": paper,
    "--bond-deep": `color-mix(in srgb, ${paper} 80%, #000)`,
    "--ink": stamp,
    "--ink-press": `color-mix(in srgb, ${stamp} 78%, #000)`,
    "--ink-soft": `color-mix(in srgb, ${stamp} 12%, #fff)`,
  };
}
