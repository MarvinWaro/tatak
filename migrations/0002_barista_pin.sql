-- Barista PIN: the barista types a 4-digit PIN on the customer's phone to approve a stamp.

ALTER TABLE shops ADD COLUMN pin_hash TEXT;                                  -- PBKDF2 hash; NULL = no PIN set
ALTER TABLE shops ADD COLUMN require_pin INTEGER NOT NULL DEFAULT 0;         -- 1 = ask for the PIN after the hold
ALTER TABLE shops ADD COLUMN pin_fail_count INTEGER NOT NULL DEFAULT 0;      -- wrong PINs in the current window (whole shop)
ALTER TABLE shops ADD COLUMN pin_fail_window_start INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cards ADD COLUMN pin_failures INTEGER NOT NULL DEFAULT 0;        -- wrong PINs typed on this card
ALTER TABLE cards ADD COLUMN pin_locked_until INTEGER NOT NULL DEFAULT 0;
