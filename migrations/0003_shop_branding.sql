-- Shop branding: card and stamp colors, plus an optional logo.

ALTER TABLE shops ADD COLUMN card_color TEXT NOT NULL DEFAULT 'canary';
ALTER TABLE shops ADD COLUMN ink_color TEXT NOT NULL DEFAULT 'violet';
ALTER TABLE shops ADD COLUMN logo_version INTEGER NOT NULL DEFAULT 0;   -- 0 = no logo; changes on every upload

-- Logos live in their own table so ordinary shop lookups don't load the image.
CREATE TABLE shop_logos (
  shop_id    TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,                     -- image/webp, image/png or image/jpeg
  data       TEXT NOT NULL,                     -- base64
  updated_at INTEGER NOT NULL
);
