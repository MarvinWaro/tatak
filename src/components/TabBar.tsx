import type { CSSProperties } from "react";
import { Link } from "../lib/router";
import { Icon, type IconName } from "./Icon";

export interface Tab {
  to: string;
  label: string;
  icon: IconName;
}

/**
 * The admin's main navigation: a floating bar at the bottom on phones, with a yellow highlight
 * that slides to the current tab; a sidebar on wide screens. Labels always show, so nobody has
 * to guess what an icon means.
 */
export function TabBar({ tabs, path, label }: { tabs: Tab[]; path: string; label: string }) {
  const active = tabs.findIndex((t) => t.to === path);
  return (
    <nav
      className="tabs"
      aria-label={label}
      data-active={active >= 0 ? "" : undefined}
      style={{ "--tab-count": tabs.length, "--active": Math.max(active, 0) } as CSSProperties}
    >
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} className="tab" aria-current={path === t.to ? "page" : undefined}>
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
