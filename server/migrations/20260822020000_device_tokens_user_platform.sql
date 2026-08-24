DELETE FROM device_tokens a
USING device_tokens b
WHERE a.user_id = b.user_id
  AND a.platform = b.platform
  AND a.created_at < b.created_at;

ALTER TABLE device_tokens DROP CONSTRAINT IF EXISTS device_tokens_user_id_token_key;
DROP INDEX IF EXISTS device_tokens_user_id_token_key;

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_user_id_platform_key
  ON device_tokens (user_id, platform);
