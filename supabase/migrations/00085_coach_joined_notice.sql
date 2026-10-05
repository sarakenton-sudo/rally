-- When a coach signs up from a parent's invite, tell the parent (in-app here;
-- push + email via the notify-coach-joined function the app calls after claiming).
CREATE OR REPLACE FUNCTION notify_inviter_on_coach_join()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_coach TEXT;
BEGIN
    IF NEW.status = 'joined' AND OLD.status IS DISTINCT FROM 'joined' THEN
        SELECT display_name INTO v_coach FROM coaches WHERE id = NEW.coach_id;
        INSERT INTO notification_log (user_id, notification_type, channel, message, status)
        VALUES (NEW.inviter_user_id, 'schedule_change', 'push',
                COALESCE(v_coach, 'Your coach') || ' joined RallyHUB from your invite. You can book lessons with them now.', 'sent');
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS coach_invites_notify_join ON coach_invites;
CREATE TRIGGER coach_invites_notify_join AFTER UPDATE OF status ON coach_invites
    FOR EACH ROW EXECUTE FUNCTION notify_inviter_on_coach_join();
