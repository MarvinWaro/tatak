import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface PinPadProps {
  busy: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  variant?: "stamp" | "reward";
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** 4-digit keypad for the barista. Sends as soon as the 4th digit is typed. */
export function PinPad({ busy, error, onSubmit, onCancel, variant = "stamp" }: PinPadProps) {
  const [digits, setDigits] = useState("");

  // Clear the dots after a wrong PIN so the barista can type again.
  useEffect(() => {
    if (!busy) setDigits("");
  }, [busy, error]);

  const press = (d: string) => {
    if (busy || digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) onSubmit(next);
  };
  const erase = () => !busy && setDigits((v) => v.slice(0, -1));

  // A laptop keyboard works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
      else if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`pinpad ${variant === "reward" ? "pinpad--reward" : ""}`} role="group" aria-label="Barista PIN">
      <p className="pinpad-title">{busy ? "Checking…" : "Barista PIN"}</p>
      <div className="pinpad-dots" aria-live="polite" aria-label={`${digits.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < digits.length ? "on" : ""} />
        ))}
      </div>
      <p className="pinpad-error" role="alert">
        {error ?? ""}
      </p>
      <div className="pinpad-keys">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} disabled={busy}>
            {k}
          </button>
        ))}
        <button type="button" className="pinpad-text" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button type="button" onClick={erase} disabled={busy || digits.length === 0} aria-label="Delete last digit">
          <Icon name="back" />
        </button>
      </div>
    </div>
  );
}
