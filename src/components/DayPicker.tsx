import { useId } from "react";
import { addDays } from "../lib/format";
import { Icon } from "./Icon";

/** Previous day, a date field, and next day. Dates are YYYY-MM-DD; `today` is the latest you can pick. */
export function DayPicker({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const id = useId();
  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="icon-btn" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <Icon name="back" />
      </button>
      <label className="sr-only" htmlFor={id}>
        Date
      </label>
      <input
        id={id}
        className="input"
        type="date"
        value={date}
        max={today}
        style={{ width: "auto" }}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      <button
        className="icon-btn"
        aria-label="Next day"
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
        style={{ transform: "scaleX(-1)" }}
      >
        <Icon name="back" />
      </button>
    </div>
  );
}
