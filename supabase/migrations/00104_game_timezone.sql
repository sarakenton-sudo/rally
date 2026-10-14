-- ============================================================
-- Game time zone: a game at "6:30 PM" happens in a specific zone (the gym's).
-- Used to show "6:30 PM CT" and for calendar exports. NULL = not set
-- (shown and exported as local time, as before).
-- ============================================================
ALTER TABLE team_events ADD COLUMN IF NOT EXISTS timezone TEXT;
