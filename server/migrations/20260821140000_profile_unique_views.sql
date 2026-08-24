CREATE TABLE IF NOT EXISTS profile_unique_views (
  profile_owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_owner_user_id, viewer_user_id),
  CONSTRAINT profile_unique_views_no_self CHECK (viewer_user_id <> profile_owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_unique_views_owner
  ON profile_unique_views (profile_owner_user_id);
