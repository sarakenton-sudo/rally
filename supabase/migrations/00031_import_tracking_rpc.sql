-- Admin RPC: import attempts report
-- Joins import_attempt events with import_completed events to show conversion

CREATE OR REPLACE FUNCTION admin_import_report(
  type_filter TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  event_type TEXT,
  import_type TEXT,
  item_count INT,
  occurred_at TIMESTAMPTZ,
  metadata JSONB,
  was_completed BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    a.id,
    a.user_id,
    au.email::TEXT AS user_email,
    a.event_type,
    (a.metadata->>'type')::TEXT AS import_type,
    COALESCE((a.metadata->>'item_count')::INT, 1) AS item_count,
    a.occurred_at,
    a.metadata,
    EXISTS (
      SELECT 1 FROM feature_events c
      WHERE c.user_id = a.user_id
        AND c.event_type = 'import_completed'
        AND c.metadata->>'type' = a.metadata->>'type'
        AND c.occurred_at > a.occurred_at
        AND c.occurred_at < a.occurred_at + interval '30 minutes'
    ) AS was_completed
  FROM feature_events a
  JOIN auth.users au ON au.id = a.user_id
  WHERE a.event_type = 'import_attempt'
    AND (type_filter IS NULL
      OR a.metadata->>'type' ILIKE '%' || type_filter || '%')
  ORDER BY a.occurred_at DESC
  LIMIT page_size OFFSET page_offset;
$$;
