-- Tatak schema.
-- Times are unix milliseconds (UTC). Money is stored in centavos (₱1.00 = 100).
-- IDs are ULIDs.

CREATE TABLE shops (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,              -- used in the customer link: /s/<slug>
  name               TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  timezone           TEXT NOT NULL DEFAULT 'Asia/Manila',
  stamps_required    INTEGER NOT NULL DEFAULT 10,
  reward_text        TEXT NOT NULL DEFAULT '1 free coffee',
  stamp_mode         TEXT NOT NULL DEFAULT 'per_cup' CHECK (stamp_mode IN ('per_cup', 'per_order')),
  cooldown_minutes   INTEGER NOT NULL DEFAULT 10,       -- 0 = no wait between stamped orders
  max_stamps_per_day INTEGER NOT NULL DEFAULT 5,        -- per card; 0 = no limit
  open_time          TEXT,                              -- 'HH:MM' shop time; NULL = stamps allowed any time
  close_time         TEXT,
  failed_logins      INTEGER NOT NULL DEFAULT 0,
  locked_until       INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                          -- sha-256 of the cookie value
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_shop ON sessions(shop_id);

CREATE TABLE menu_items (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  earns_stamp  INTEGER NOT NULL DEFAULT 1,
  is_available INTEGER NOT NULL DEFAULT 1,              -- 0 = sold out today
  is_archived  INTEGER NOT NULL DEFAULT 0,              -- removed from the menu; kept for old orders
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX menu_items_shop ON menu_items(shop_id, is_archived, sort_order);

CREATE TABLE cards (
  id               TEXT PRIMARY KEY,
  shop_id          TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,                       -- short public code printed on the card, e.g. K7Q4MZ
  secret_hash      TEXT NOT NULL UNIQUE,                -- sha-256 of the customer's backup code
  nickname         TEXT,
  stamps           INTEGER NOT NULL DEFAULT 0,          -- current balance
  lifetime_stamps  INTEGER NOT NULL DEFAULT 0,
  rewards_redeemed INTEGER NOT NULL DEFAULT 0,
  is_blocked       INTEGER NOT NULL DEFAULT 0,
  last_visit_at    INTEGER,
  created_at       INTEGER NOT NULL,
  UNIQUE (shop_id, code)
);
CREATE INDEX cards_shop_last_visit ON cards(shop_id, last_visit_at);

CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  shop_id        TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  card_id        TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'voided')),
  is_reward      INTEGER NOT NULL DEFAULT 0,            -- 1 = free coffee paid for with stamps
  approved_via   TEXT NOT NULL DEFAULT 'tap',           -- 'tap' for now; room for 'pin' or 'nfc' later
  total_cents    INTEGER NOT NULL,
  item_count     INTEGER NOT NULL,
  stamps_awarded INTEGER NOT NULL DEFAULT 0,
  stamps_used    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  voided_at      INTEGER
);
CREATE INDEX orders_shop_time ON orders(shop_id, created_at);
CREATE INDEX orders_card_time ON orders(card_id, created_at);

-- Name and price are copied at order time so old reports stay correct after menu changes.
CREATE TABLE order_items (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  qty          INTEGER NOT NULL,
  earns_stamp  INTEGER NOT NULL
);
CREATE INDEX order_items_order ON order_items(order_id);

-- Manual stamp corrections made by the barista.
CREATE TABLE stamp_adjustments (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  card_id    TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX stamp_adjustments_card ON stamp_adjustments(card_id, created_at);
