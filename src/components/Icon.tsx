// Small stroke icon set, drawn on a 24px grid.
const paths = {
  cup: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M8 3.5c0 1 1 1.5 1 2.5S8 7.5 8 8.5 M11.5 3.5c0 1 1 1.5 1 2.5s-1 1.5-1 2.5",
  chart: "M4 20h16 M7 16v-5 M12 16V6 M17 16v-8",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Z M9 8h6 M9 12h6 M9 16h3",
  menu: "M5 6h14 M5 12h14 M5 18h9",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.8c1.8.8 3 2.6 3.5 5.2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 13.5l1.6 1.2-2 3.4-1.9-.8a7 7 0 0 1-1.9 1.1L15 20.5h-4l-.3-2.1a7 7 0 0 1-1.9-1.1l-1.9.8-2-3.4 1.6-1.2a7 7 0 0 1 0-2.9L4.9 9.4l2-3.4 1.9.8a7 7 0 0 1 1.9-1.1L11 3.5h4l.3 2.2a7 7 0 0 1 1.9 1.1l1.9-.8 2 3.4-1.6 1.2a7 7 0 0 1 0 2.9Z",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  back: "M15 5l-7 7 7 7",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  print: "M7 9V3h10v6 M7 18H4v-7h16v7h-3 M7 14h10v7H7z",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4",
  download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  close: "M6 6l12 12 M18 6L6 18",
  store: "M3 9h18l-1.5-5h-15L3 9Z M5 9v11h14V9 M10 20v-5h4v5",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:
    "M3 3l18 18 M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2 M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5 M9.9 9.9a3 3 0 0 0 4.2 4.2",
  gift: "M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7C11 4.5 9.5 3.5 8.3 3.8 6.6 4.2 7 6.6 12 7Z M12 7c1-2.5 2.5-3.5 3.7-3.2 1.7.4 1.3 2.8-3.7 3.2Z",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "icon", label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** The Tatak wordmark: stamp mascot plus "Loyalty for local shops". */
export function BrandLogo() {
  return <img src="/assets/img/logo.png" alt="Tatak" width={640} height={223} />;
}
