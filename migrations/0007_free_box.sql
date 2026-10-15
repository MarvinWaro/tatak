-- The free reward is now the last box on the card: with 10 boxes, the customer buys 9 and the
-- 10th is free. The free item is given inside a normal order (next to paid items), so each
-- order_items line says whether it was the free one.
ALTER TABLE order_items ADD COLUMN is_free INTEGER NOT NULL DEFAULT 0;

-- Free-drink orders from before this change had a single line, the free item.
UPDATE order_items SET is_free = 1 WHERE order_id IN (SELECT id FROM orders WHERE is_reward = 1);
