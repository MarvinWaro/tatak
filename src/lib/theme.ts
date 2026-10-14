import { useEffect } from "react";
import { type CardColor, type InkColor, themeVars } from "../../shared/theme";

/** Recolors the page with the shop's card and ink colors while this screen is open. */
export function useShopTheme(card: CardColor | undefined, ink: InkColor | undefined) {
  useEffect(() => {
    if (!card || !ink) return;
    const vars = themeVars(card, ink);
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.removeProperty(k);
    };
  }, [card, ink]);
}
