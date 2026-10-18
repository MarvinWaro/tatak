// Guided tours of the admin pages, built on driver.js. It's loaded only when a tour starts,
// so customers' phones never download it. Steps point at elements with data-tour="…".
import { readItem, writeItem } from "./storage";

/** One step: the element to point at (by its data-tour name) and what to say about it. */
interface TourStep {
  target: string;
  title: string;
  text: string;
}

const TOURS = {
  settings: [
    {
      target: "link",
      title: "Your customer link",
      text: "Customers open this link by scanning your QR poster. Print the poster here and tape it to your counter.",
    },
    {
      target: "design",
      title: "Card design",
      text: "Pick the card and stamp colors and upload your logo. Customers see changes right away.",
    },
    {
      target: "promos",
      title: "Promos (optional)",
      text: "Give a bonus on the way to the free drink, like 50% off on stamp 5. Each works once per card.",
    },
    {
      target: "pin",
      title: "Barista PIN",
      text: "Set a 4-digit PIN and turn it on. Then only you and your staff can stamp a card.",
    },
    {
      target: "card",
      title: "Stamp card",
      text: "Your shop name, how many boxes the card has (the last one is free), and what the reward is.",
    },
    {
      target: "limits",
      title: "Limits",
      text: "Stop people from stamping away from your stall: a wait between orders, a daily limit, and opening hours.",
    },
    {
      target: "account",
      title: "Your account",
      text: "Change your password or log out here. You can replay this tour anytime with “Show me around” at the top.",
    },
  ],
  menu: [
    {
      target: "add-name",
      title: "Add a drink",
      text: "Type its name as customers know it, like Spanish Latte.",
    },
    {
      target: "add-price",
      title: "One price",
      text: "If it comes in one size only, type the price here.",
    },
    {
      target: "add-sizes",
      title: "Sizes",
      text: "Sold in sizes like 16 oz and 22 oz? Tap “+ Other size” and type each size and its price. Sizes you use come back as one-tap buttons on your next drink.",
    },
    {
      target: "add-stamp",
      title: "Gives a stamp",
      text: "Leave this on for drinks. Turn it off for things like pastries that shouldn't count toward the free drink.",
    },
    {
      target: "add-submit",
      title: "Save it",
      text: "Tap Add item. It shows on your customers' order screen right away.",
    },
    {
      target: "menu-list",
      title: "Your menu",
      text: "Customers see your items in this order.",
    },
    {
      target: "menu-row",
      title: "Change an item",
      text: "Turn off Available when it's sold out, use the arrows to move it, and tap Edit to change the name, price or sizes.",
    },
  ],
} satisfies Record<string, TourStep[]>;

export type TourName = keyof typeof TOURS;

const seenKey = (name: TourName) => `tatak:tour:${name}`;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Starts a tour. Steps whose element isn't on the page (an empty menu, say) are skipped. */
export async function startTour(name: TourName): Promise<void> {
  writeItem(seenKey(name), "1");
  const [{ driver }] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")]);
  const steps = TOURS[name]
    .filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
    .map((s) => ({ element: `[data-tour="${s.target}"]`, popover: { title: s.title, description: s.text } }));
  const motion = !reducedMotion();
  driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "tatak-tour",
    stagePadding: 6,
    animate: motion,
    smoothScroll: motion,
  }).drive();
}

/** True until this tour has run once in this browser. */
export const tourUnseen = (name: TourName): boolean => readItem(seenKey(name)) !== "1";
