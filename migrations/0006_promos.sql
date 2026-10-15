-- Promos on chosen stamps, e.g. stamp 5 = 50% off one item. Up to 3 per shop.
-- A promo doesn't use up stamps. It can be used once per round of the card; a round ends
-- when the customer claims the free reward (cards.rewards_redeemed goes up by one).

CREATE TABLE card_promos (
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  step        INTEGER NOT NULL,                                     -- stamp number that unlocks it, 1 .. stamps_required - 1
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 0 AND 100), -- 0 = perk given by hand, no price change
  label       TEXT NOT NULL,                                        -- shown in the card slot, e.g. "50% off"
  PRIMARY KEY (shop_id, step)
) WITHOUT ROWID;

ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN promo_step INTEGER;   -- NULL = no promo used
ALTER TABLE orders ADD COLUMN promo_round INTEGER;  -- cards.rewards_redeemed when the promo was used

-- A promo can be used once per round. Voiding the order takes it out of this index,
-- so the promo is ready again. Also serves the "which promos were used" lookup.
CREATE UNIQUE INDEX orders_promo_once ON orders(card_id, promo_round, promo_step)
  WHERE promo_step IS NOT NULL AND status = 'approved';
