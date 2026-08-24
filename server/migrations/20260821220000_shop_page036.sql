ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE shop_items SET is_active = FALSE WHERE deleted_at IS NOT NULL AND is_active = TRUE;

ALTER TABLE shop_purchases
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_pence INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shop_purchases DROP CONSTRAINT IF EXISTS shop_purchases_stripe_session_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS shop_purchases_session_item_idx
  ON shop_purchases (stripe_session_id, item_id);

CREATE TABLE IF NOT EXISTS shop_checkout_intents (
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (buyer_id, idempotency_key)
);
