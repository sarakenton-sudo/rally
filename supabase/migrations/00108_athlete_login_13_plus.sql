-- ============================================================
-- Athlete logins are 13+ only (Terms §2, Privacy §8 — COPPA)
-- Both invite paths (athlete page card, Settings → Invite) insert into
-- athlete_invites from the client, so the rule lives in a trigger. Age comes
-- from grad year: an athlete in 8th grade or above (US school year starting
-- in August) counts as 13+; no grad year means we can't tell, so refuse.
-- ============================================================

CREATE OR REPLACE FUNCTION athlete_invite_age_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name TEXT;
    v_grad INT;
    v_school_year_end INT := extract(year FROM now())::int
        + CASE WHEN extract(month FROM now()) >= 8 THEN 1 ELSE 0 END;
BEGIN
    IF NEW.invite_type IS DISTINCT FROM 'athlete' THEN RETURN NEW; END IF;
    SELECT first_name, grad_year INTO v_name, v_grad FROM athletes WHERE id = NEW.athlete_id;
    IF v_grad IS NULL THEN
        RAISE EXCEPTION 'Add %''s grad year first. Athlete logins are only for athletes 13 or older.', coalesce(v_name, 'the athlete');
    END IF;
    IF 12 - (v_grad - v_school_year_end) < 8 THEN
        RAISE EXCEPTION 'Athlete logins are only for athletes 13 or older (8th grade and up). % can use the app through your account.', coalesce(v_name, 'Your athlete');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_invites_age_check ON athlete_invites;
CREATE TRIGGER athlete_invites_age_check
    BEFORE INSERT ON athlete_invites
    FOR EACH ROW EXECUTE FUNCTION athlete_invite_age_check();
