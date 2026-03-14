-- Add streaming fields to seasons table (moved from admin_config)
ALTER TABLE seasons ADD COLUMN default_streaming_platform text;
ALTER TABLE seasons ADD COLUMN default_stream_url text;

-- Copy current admin_config streaming values to the active season
UPDATE seasons s
SET default_streaming_platform = ac.default_streaming_platform,
    default_stream_url = ac.default_stream_url
FROM admin_config ac
WHERE s.id = ac.active_season_id
  AND ac.default_stream_url IS NOT NULL;
