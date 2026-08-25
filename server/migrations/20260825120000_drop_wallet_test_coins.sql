-- Test coins are Valkey-only (battle/animation QA). Never Neon money.
ALTER TABLE wallet_balances DROP COLUMN IF EXISTS test_coins;

ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_bucket_check;
ALTER TABLE wallet_ledger
  ADD CONSTRAINT wallet_ledger_bucket_check
  CHECK (bucket IN ('paid', 'promo', 'starter'));
