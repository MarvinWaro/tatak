import { useState } from "react";
import { Icon } from "./Icon";

/** A password field with an eye button to show or hide what was typed. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="input-password">
      <input
        id={id}
        className="input"
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <button
        type="button"
        className="input-eye"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={id}
        onClick={() => setShown(!shown)}
      >
        <Icon name={shown ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}
