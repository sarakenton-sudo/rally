-- Add club_name column to team_config
ALTER TABLE team_config ADD COLUMN IF NOT EXISTS club_name text;
