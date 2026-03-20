-- Database webhook trigger for new lead SMS notifications.
-- Calls the notify-new-lead edge function on every new lead insert.
-- Uses Supabase's built-in pg_net extension for async HTTP.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION notify_new_lead() RETURNS TRIGGER AS $$
BEGIN
  -- Fire-and-forget async HTTP call to edge function
  PERFORM net.http_post(
    url := 'https://dtoolzolnxfjlivwyblv.supabase.co/functions/v1/notify-new-lead'::text,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'leads',
      'record', row_to_json(NEW)::jsonb
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the insert if notification fails
  RAISE WARNING 'notify_new_lead failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_lead_notify ON leads;
CREATE TRIGGER on_new_lead_notify
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_lead();
