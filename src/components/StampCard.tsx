import type { CSSProperties } from "react";
import type { Promo } from "../../shared/types";
import { ordinal } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface StampCardProps {
  shopName: string;
  code?: string;
  required: number;
  stamps: number;
  /** Dates of the stamps on the card, newest first. */
  stampDates: number[];
  /** "1 free coffee". Leave out to hide the "10th stamp = …" line. */
  rewardText?: string;
  /** Icon in the last, reward slot. */
  rewardIcon?: IconName;
  /** Promos on chosen stamps; their label shows in the empty slot. */
  promos?: Promo[];
  timezone: string;
  /** How many of the newest stamps to animate in. */
  fresh?: number;
  logoUrl?: string | null;
  className?: string;
}

const monthFmt = new Map<string, Intl.DateTimeFormat>();
function monthDay(ms: number, tz: string): [string, string] {
  let f = monthFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
    monthFmt.set(tz, f);
  }
  const parts = f.formatToParts(ms);
  return [
    parts.find((p) => p.type === "month")?.value.toUpperCase() ?? "",
    parts.find((p) => p.type === "day")?.value ?? "",
  ];
}

/** Each stamp lands at its own slight angle, like a real rubber stamp. Stable per stamp. */
function tilt(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 26 - 13);
}

export function StampCard({
  shopName,
  code,
  required,
  stamps,
  stampDates,
  rewardText,
  rewardIcon = "cup",
  promos = [],
  timezone,
  fresh = 0,
  className = "",
  logoUrl,
}: StampCardProps) {
  // The last box is the free one: paid stamps fill the boxes before it, and the cup that
  // lands on it is free. Stamps past that (a free item saved for later) show as extra.
  const filled = Math.min(stamps, required - 1);
  const extra = Math.max(0, stamps - (required - 1));
  const freeReady = stamps >= required - 1;
  const cols = required <= 5 ? required : required <= 12 ? Math.ceil(required / 2) : 6;

  return (
    <section
      className={`ticket ${fresh > 0 ? "ticket--thunk" : ""} ${className}`}
      aria-label={`${shopName} stamp card: ${filled} of ${required} stamps`}
    >
      <div className="ticket-head">
        <span className="ticket-shop">
          {logoUrl && <img className="ticket-logo" src={logoUrl} alt="" />}
          {shopName}
        </span>
        {code && <span className="ticket-code">Card {code}</span>}
      </div>
      <div className="ticket-grid" style={{ "--cols": cols } as CSSProperties}>
        {Array.from({ length: required }, (_, i) => {
          const isFilled = i < filled;
          const isLast = i === required - 1;
          if (!isFilled) {
            const promo = promos.find((p) => p.step === i + 1);
            return (
              <div className="slot" key={i}>
                {promo && !isLast ? (
                  <span className="slot-empty slot-empty--promo">
                    <span>{promo.label}</span>
                  </span>
                ) : isLast ? (
                  <span className={`slot-empty slot-empty--reward ${freeReady ? "slot-empty--ready" : ""}`}>
                    <span>
                      <Icon name={rewardIcon} />
                      <br />
                      Free
                    </span>
                  </span>
                ) : (
                  <span className="slot-empty">{i + 1}</span>
                )}
              </div>
            );
          }
          // Circles fill oldest first, so circle i shows the (filled - 1 - i)th newest date.
          const date = stampDates[filled - 1 - i] ?? Date.now();
          const [mon, day] = monthDay(date, timezone);
          const isFresh = i >= filled - fresh;
          const order = i - (filled - fresh);
          return (
            <div className="slot" key={i}>
              <svg
                viewBox="0 0 100 100"
                className={`stamp ${isFresh ? "stamp--fresh" : ""}`}
                style={{ "--rot": `${tilt(date / 1000 + i)}deg`, "--delay": `${order * 160}ms` } as CSSProperties}
                aria-hidden="true"
              >
                <g filter="url(#ink-rough)">
                  <circle cx="50" cy="50" r="45" fill="currentColor" />
                  <text x="50" y="44" className="stamp-mon">
                    {mon}
                  </text>
                  <text x="50" y="76" className="stamp-day">
                    {day}
                  </text>
                </g>
              </svg>
            </div>
          );
        })}
      </div>
      {(rewardText || extra > 0) && (
        <div className="ticket-foot">
          {rewardText && (
            <span>
              {ordinal(required)} stamp = {rewardText}
            </span>
          )}
          {extra > 0 && <span>+{extra} extra</span>}
        </div>
      )}
    </section>
  );
}

/** Roughens stamp edges and adds a few light spots, like ink from a stamp pad. Render once per page. */
export function InkFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="ink-rough" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 2.6"
          result="speckle"
        />
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
    </svg>
  );
}
