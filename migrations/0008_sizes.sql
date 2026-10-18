-- Sizes per menu item, each with its own price (Spanish Latte: Medium ₱100, Large ₱120).
-- An item with no sizes keeps using menu_items.price_cents. Removed sizes are archived, like
-- menu items, so old orders keep their link.
CREATE TABLE menu_item_sizes (
  id           TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX menu_item_sizes_item ON menu_item_sizes(menu_item_id, is_archived, sort_order);

-- order_items.name already stores the name as sold ("Spanish Latte (Large)"); this keeps the link.
ALTER TABLE order_items ADD COLUMN size_id TEXT REFERENCES menu_item_sizes(id) ON DELETE SET NULL;
