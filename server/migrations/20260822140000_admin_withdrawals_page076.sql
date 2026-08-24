-- PAGE-076 Admin Withdrawals: durable review actor/note columns on the
-- canonical withdrawals_gbp store. Do not create a second payout table.

ALTER TABLE withdrawals_gbp
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
