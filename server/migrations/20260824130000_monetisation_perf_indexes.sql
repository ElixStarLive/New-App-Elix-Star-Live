-- Monetisation performance indexes for payout/admin financial paths.
-- These do not alter business logic; they reduce scan cost on hot read/query paths.

CREATE INDEX IF NOT EXISTS financial_ledger_account_reason_created_idx
  ON financial_ledger (account, reason, created_at DESC);

CREATE INDEX IF NOT EXISTS memberships_creator_status_expires_idx
  ON memberships (creator_id, status, expires_at);

CREATE INDEX IF NOT EXISTS withdrawals_gbp_status_created_idx
  ON withdrawals_gbp (status, created_at);

CREATE INDEX IF NOT EXISTS withdrawals_gbp_user_created_idx
  ON withdrawals_gbp (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS processed_purchases_created_idx
  ON processed_purchases (created_at DESC);

CREATE INDEX IF NOT EXISTS shop_purchases_created_idx
  ON shop_purchases (created_at DESC);
