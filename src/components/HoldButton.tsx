import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

interface HoldButtonProps {
  label: string;
  busyLabel: string;
  busy?: boolean;
  onComplete: () => void;
  durationMs?: number;
  variant?: "stamp" | "reward";
}

const RADIUS = 86;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The barista presses and holds; letting go early cancels. Prevents accidental taps. */
export function HoldButton({ label, busyLabel, busy = false, onComplete, durationMs = 900, variant = "stamp" }: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const frame = useRef(0);
  const startedAt = useRef(0);
  const finished = useRef(false);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (!busy) {
      finished.current = false;
      setProgress(0);
    }
  }, [busy]);

  const tick = () => {
    const p = Math.min(1, (performance.now() - startedAt.current) / durationMs);
    setProgress(p);
    if (p >= 1) {
      finished.current = true;
      setHolding(false);
      navigator.vibrate?.(35);
      onComplete();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (busy || finished.current) return;
    setHolding(true);
    startedAt.current = performance.now();
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(frame.current);
    setHolding(false);
    if (!finished.current) setProgress(0);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      start();
    }
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") stop();
  };

  return (
    <button
      type="button"
      className={`hold ${variant === "reward" ? "hold--reward" : ""}`}
      data-holding={holding}
      disabled={busy}
      aria-label={busy ? busyLabel : `${label}. Press and hold.`}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 184 184" aria-hidden="true">
        <circle className="ring-track" cx="92" cy="92" r={RADIUS} />
        <circle
          className="ring"
          cx="92"
          cy="92"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - (busy ? 1 : progress))}
        />
      </svg>
      <span className="hold-label">{busy ? busyLabel : label}</span>
    </button>
  );
}
