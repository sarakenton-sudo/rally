-- ============================================================
-- Archive a season: it drops off Home, Schedule, Travel and the switcher but
-- nothing is deleted. Unarchive brings it back.
-- ============================================================
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
