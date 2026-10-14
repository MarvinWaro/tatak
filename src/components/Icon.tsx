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

export function BrandMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#F6DE5C" />
      <circle cx="32" cy="32" r="21" fill="#4B2F8E" />
      <path d="M24 26h16v3h-6.5v14h-3V29H24z" fill="#F6DE5C" />
    </svg>
  );
}
