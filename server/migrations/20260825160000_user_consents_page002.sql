-- PAGE-002: align user_consents with OLD production consent fields
-- (consent_type, version, age_confirmed_13_plus, accepted_at, meta).
BEGIN;

ALTER TABLE user_consents
  ADD COLUMN IF NOT EXISTS consent_type TEXT,
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS age_confirmed_13_plus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE user_consents
SET consent_type = COALESCE(NULLIF(consent_type, ''), kind)
WHERE consent_type IS NULL OR consent_type = '';

UPDATE user_consents
SET version = COALESCE(NULLIF(version, ''), '2026-07-21')
WHERE version IS NULL OR version = '';

UPDATE user_consents
SET age_confirmed_13_plus = TRUE
WHERE consent_type = 'terms_privacy_and_age_13_plus'
  AND age_confirmed_13_plus IS NOT TRUE;

ALTER TABLE user_consents
  ALTER COLUMN consent_type SET NOT NULL,
  ALTER COLUMN version SET NOT NULL;

ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_user_id_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_consents_user_type_version_uidx
  ON user_consents (user_id, consent_type, version);

ALTER TABLE user_consents DROP COLUMN IF EXISTS kind;

COMMIT;
