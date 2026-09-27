-- ============================================================
-- Coach Lesson Terms + Liability Release
--
-- Every coach has Lesson Terms and a Liability Release. RallyHUB provides a
-- starter default for each; the coach can replace either with their own text.
-- Parents accept both (typed-name signature) per coach + athlete before a
-- lesson request, and again whenever the coach changes the text. The exact
-- text accepted is snapshotted in policy_acceptances as the record.
--
-- RallyHUB's own protection lives in fixed platform text coaches can't edit:
--   * default_platform_terms()  — accepted by parents with every coach's policies
--   * coach_platform_agreement() — accepted once by each coach
-- Athlete health info (allergies, medical notes, emergency contact) is required
-- before a lesson request and shared only with coaches the family books.
--
-- Defaults are starter templates, not legal advice — the coach screen says so.
-- ============================================================

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS terms_text          TEXT;        -- NULL = RallyHUB default
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS release_text        TEXT;        -- NULL = RallyHUB default
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS policies_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS policies_reviewed   BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION default_coach_terms()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT $t$LESSON TERMS — {{coach}}

These terms apply to every lesson, clinic, or camp you book with {{coach}} ("Coach") through RallyHUB.

1. Booking. A lesson is confirmed only when Coach accepts your request. Times, locations, and prices shown at booking apply.

2. Payment. Lessons are paid at the price shown when you book, by the method and timing Coach sets. Unpaid balances may pause future bookings.

3. Cancellations by you. Please cancel at least 24 hours before the lesson. Cancellations inside 24 hours, and no-shows, may be charged in full.

4. Cancellations by Coach. If Coach cancels, or the facility is closed (weather, power, scheduling), you will be offered a new time or a full refund for that lesson.

5. Late arrival. Lessons start and end on time. Arriving late does not extend the lesson.

6. Health and readiness. Tell Coach before the lesson about any injury, illness, or condition that could affect participation. Coach may shorten or stop a lesson for safety.

7. Conduct. Athletes and families are expected to be respectful. Coach may end a lesson, without refund, for unsafe or abusive behavior.

8. Facility rules. Athletes follow the rules of the facility where the lesson takes place.

9. Photos and video. Coach may record video for instruction and share it with you. Coach will not post an athlete's image publicly without your permission.

10. Communication. You agree that Coach and RallyHUB may contact you by app notification, email, or text about your bookings.

11. Changes. Coach may update these terms. You'll be asked to accept any new version before your next booking.$t$ $$;

CREATE OR REPLACE FUNCTION default_coach_release()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT $t$PARTICIPANT RELEASE AND ASSUMPTION OF RISK — {{coach}}

Please read carefully. By accepting, you give up certain legal rights.

1. Assumption of risk. Volleyball and athletic training involve inherent risks, including falls, collisions, being struck by a ball, sprains, fractures, concussions, and other injuries, some of which can be serious. I understand these risks and voluntarily choose to have the athlete participate.

2. Fitness to participate. I confirm the athlete is physically able to participate and I will tell Coach about any condition that affects safe participation.

3. Release. To the fullest extent allowed by law, I release {{coach}} ("Coach"), and the facilities used for lessons, from claims for injury, illness, or property loss arising from participation in lessons, except those caused by gross negligence or willful misconduct.

4. Medical treatment. If the athlete needs medical attention and I cannot be reached, I authorize Coach to seek emergency medical treatment for the athlete, and I accept responsibility for its cost.

5. Parent or guardian. If the athlete is under 18, I confirm I am the athlete's parent or legal guardian and I accept this release on the athlete's behalf and my own.

6. Scope. This release covers all lessons, clinics, and camps booked with Coach through RallyHUB until I revoke it in writing or Coach issues a new version.

7. Severability. If any part of this release is found unenforceable, the rest remains in effect.

RallyHUB provides booking and payment tools and is not a party to the coaching relationship.$t$ $$;

-- Fixed RallyHUB platform terms for families (NOT coach-editable).
CREATE OR REPLACE FUNCTION default_platform_terms()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT $t$RALLYHUB PLATFORM TERMS

RallyHUB is operated by Quiet Standard Consulting LLC ("RallyHUB"). By booking a lesson through RallyHUB you agree:

1. RallyHUB is a technology platform. It provides scheduling, messaging, and payment tools. RallyHUB does not provide coaching, instruction, supervision, or facilities, and is not a party to the agreement between you and the coach.

2. Coaches are independent. Coaches are independent businesses, not employees, agents, or contractors of RallyHUB. RallyHUB does not supervise or control how lessons are conducted.

3. Verification. Any credential, certification, or background status shown on a coach's profile is provided by the coach or a third party. RallyHUB does not guarantee a coach's qualifications, conduct, or safety, and you are responsible for choosing a coach.

4. Release and indemnity. To the fullest extent allowed by law, you release RallyHUB and its owners, officers, and employees from all claims arising from lessons, coaches, facilities, or participation, and you agree to indemnify and hold RallyHUB harmless from claims brought by you or the athlete arising from them.

5. Limitation of liability. To the fullest extent allowed by law, RallyHUB is not liable for indirect, incidental, or consequential damages, and RallyHUB's total liability for any claim is limited to the fees RallyHUB received for the booking at issue.

6. Payments. Payments are processed by Stripe. Refunds follow the coach's terms.

7. Health information. The allergies, medical notes, and emergency contact you provide are shared with coaches you book so they can respond in an emergency. Keep them accurate.

8. Disputes. Questions about a lesson go to the coach first. RallyHUB may help, but is not obligated to resolve disputes between families and coaches.$t$ $$;

-- Fixed agreement each coach accepts before taking bookings (NOT editable).
CREATE OR REPLACE FUNCTION coach_platform_agreement()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT $t$RALLYHUB COACH PLATFORM AGREEMENT

RallyHUB is operated by Quiet Standard Consulting LLC ("RallyHUB"). To offer lessons through RallyHUB you agree:

1. You are independent. You run your own business. You are not an employee, agent, or contractor of RallyHUB, and you are solely responsible for your lessons, your conduct, and the athletes in your care.

2. Your responsibilities. You are responsible for your own liability insurance, required certifications, SafeSport training and any background screening your sport or facility requires, facility permissions, taxes, and compliance with all laws that apply to coaching minors.

3. Accurate profile. Everything on your profile — credentials, certifications, SafeSport status, prices — is accurate and kept current.

4. Your terms and release. The lesson terms and liability release you publish are yours. RallyHUB's starter templates are provided as a convenience, are not legal advice, and you should have them reviewed by an attorney in your state.

5. Health information. You will use athlete health information (allergies, medical notes, emergency contacts) only for the athlete's safety and keep it confidential.

6. Indemnity. You agree to indemnify and hold RallyHUB and its owners, officers, and employees harmless from any claim, loss, or expense arising from your lessons, your conduct, your terms, or your breach of this agreement.

7. Limitation of liability. To the fullest extent allowed by law, RallyHUB is not liable to you for indirect or consequential damages, and its total liability is limited to the fees RallyHUB received from your bookings in the prior three months.

8. Changes and removal. RallyHUB may update this agreement or remove a coach who violates it or puts athletes at risk.$t$ $$;

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS platform_agreement_accepted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION accept_coach_platform_agreement()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE coaches SET platform_agreement_accepted_at = now() WHERE id = my_coach_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'not a coach'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION accept_coach_platform_agreement() TO authenticated;
GRANT EXECUTE ON FUNCTION coach_platform_agreement() TO authenticated;

-- ------------------------------------------------------------
-- Athlete health info (required before a lesson request)
-- ------------------------------------------------------------
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS allergies               TEXT;   -- 'None' is a valid answer
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS medical_notes           TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS health_updated_at       TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_athlete_health(p_athlete_id UUID, p_allergies TEXT, p_medical_notes TEXT, p_ec_name TEXT, p_ec_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'athlete is not accessible to this user';
    END IF;
    IF NULLIF(trim(p_allergies), '') IS NULL THEN RAISE EXCEPTION 'list allergies, or type None'; END IF;
    IF NULLIF(trim(p_ec_name), '') IS NULL OR NULLIF(trim(p_ec_phone), '') IS NULL THEN
        RAISE EXCEPTION 'add an emergency contact name and phone';
    END IF;
    UPDATE athletes
       SET allergies = trim(p_allergies),
           medical_notes = NULLIF(trim(p_medical_notes), ''),
           emergency_contact_name = trim(p_ec_name),
           emergency_contact_phone = trim(p_ec_phone),
           health_updated_at = now()
     WHERE id = p_athlete_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_athlete_health(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Record of each acceptance, with the exact text shown.
CREATE TABLE IF NOT EXISTS policy_acceptances (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id       UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id     UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    signer_name    TEXT NOT NULL,
    terms_text     TEXT NOT NULL,
    release_text   TEXT NOT NULL,
    platform_text  TEXT NOT NULL,
    policies_version TIMESTAMPTZ NOT NULL,   -- coaches.policies_updated_at at acceptance
    accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_lookup
    ON policy_acceptances(coach_id, parent_user_id, athlete_id, accepted_at DESC);

ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceptances readable by parent or coach" ON policy_acceptances;
CREATE POLICY "Acceptances readable by parent or coach"
    ON policy_acceptances FOR SELECT
    USING (parent_user_id = auth.uid() OR coach_id = my_coach_id());
-- No client writes: accept_coach_policies() is the only writer.

-- ------------------------------------------------------------
-- get_coach_policies — rendered text for a coach (anyone may read; needed on
-- the booking screen and the public booking page).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_policies(p_coach_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'coach_id', c.id,
        'terms', replace(COALESCE(c.terms_text, default_coach_terms()), '{{coach}}', c.display_name),
        'release', replace(COALESCE(c.release_text, default_coach_release()), '{{coach}}', c.display_name),
        'platform', default_platform_terms(),
        'terms_is_default', c.terms_text IS NULL,
        'release_is_default', c.release_text IS NULL,
        'version', c.policies_updated_at,
        'reviewed', c.policies_reviewed,
        'platform_agreement_accepted_at', CASE WHEN c.id = my_coach_id() THEN c.platform_agreement_accepted_at END
    )
    FROM coaches c WHERE c.id = p_coach_id;
$$;
GRANT EXECUTE ON FUNCTION get_coach_policies(UUID) TO anon, authenticated;

-- Coach saves custom text (NULL resets to the RallyHUB default). Any change
-- bumps the version so families re-accept on their next booking.
CREATE OR REPLACE FUNCTION set_my_coach_policies(p_terms TEXT, p_release TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach coaches%ROWTYPE;
    v_terms TEXT := NULLIF(trim(p_terms), '');
    v_release TEXT := NULLIF(trim(p_release), '');
BEGIN
    SELECT * INTO v_coach FROM coaches WHERE id = my_coach_id() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not a coach'; END IF;
    -- Saving the default text verbatim keeps it as "default".
    IF v_terms = default_coach_terms() THEN v_terms := NULL; END IF;
    IF v_release = default_coach_release() THEN v_release := NULL; END IF;

    UPDATE coaches
       SET terms_text = v_terms,
           release_text = v_release,
           policies_reviewed = true,
           policies_updated_at = CASE
               WHEN v_terms IS DISTINCT FROM v_coach.terms_text OR v_release IS DISTINCT FROM v_coach.release_text
               THEN now() ELSE policies_updated_at END
     WHERE id = v_coach.id;
    RETURN get_coach_policies(v_coach.id);
END;
$$;
GRANT EXECUTE ON FUNCTION set_my_coach_policies(TEXT, TEXT) TO authenticated;

-- Has this parent accepted the coach's current policies for this athlete?
CREATE OR REPLACE FUNCTION has_accepted_coach_policies(p_coach_id UUID, p_athlete_id UUID, p_parent UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM policy_acceptances pa
        JOIN coaches c ON c.id = pa.coach_id
        WHERE pa.coach_id = p_coach_id AND pa.athlete_id = p_athlete_id
          AND pa.parent_user_id = p_parent
          AND pa.policies_version >= c.policies_updated_at
    );
$$;
GRANT EXECUTE ON FUNCTION has_accepted_coach_policies(UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION accept_coach_policies(p_coach_id UUID, p_athlete_id UUID, p_signer_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pol JSONB;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF p_athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'athlete is not accessible to this user';
    END IF;
    IF length(trim(COALESCE(p_signer_name, ''))) < 2 THEN
        RAISE EXCEPTION 'type your full name to sign';
    END IF;
    v_pol := get_coach_policies(p_coach_id);
    IF v_pol IS NULL THEN RAISE EXCEPTION 'coach not found'; END IF;

    INSERT INTO policy_acceptances (coach_id, parent_user_id, athlete_id, signer_name, terms_text, release_text, platform_text, policies_version)
    VALUES (p_coach_id, auth.uid(), p_athlete_id, trim(p_signer_name),
            v_pol->>'terms', v_pol->>'release', v_pol->>'platform', (v_pol->>'version')::timestamptz);
END;
$$;
GRANT EXECUTE ON FUNCTION accept_coach_policies(UUID, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Enforce: no lesson request without a current acceptance.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_policy_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM coaches WHERE id = NEW.coach_id AND platform_agreement_accepted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'COACH_NOT_READY: this coach isn''t taking bookings on RallyHUB yet';
    END IF;
    IF NOT has_accepted_coach_policies(NEW.coach_id, NEW.athlete_id, NEW.parent_user_id) THEN
        RAISE EXCEPTION 'POLICIES_NOT_ACCEPTED: accept the coach''s lesson terms and release first';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM athletes
         WHERE id = NEW.athlete_id AND allergies IS NOT NULL AND emergency_contact_phone IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'HEALTH_INFO_REQUIRED: add allergies and an emergency contact first';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_requests_require_policies ON booking_requests;
CREATE TRIGGER booking_requests_require_policies
    BEFORE INSERT ON booking_requests
    FOR EACH ROW EXECUTE FUNCTION enforce_policy_acceptance();

-- ------------------------------------------------------------
-- Coaches see health info on requests and in the schedule.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_request_detail(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req booking_requests%ROWTYPE;
    v_out JSONB;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    IF v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;

    SELECT jsonb_build_object(
        'request_id', v_req.id,
        'status', v_req.status,
        'notes', v_req.notes,
        'film_links', v_req.film_links,
        'athlete', jsonb_build_object(
            'first_name', a.first_name,
            'last_name', a.last_name,
            'grad_year', a.grad_year,
            'positions', a.positions,
            'level', a.level,
            'club_team', a.club_team,
            'height_inches', a.height_inches,
            'goals', a.goals,
            'allergies', a.allergies,
            'medical_notes', a.medical_notes,
            'emergency_contact_name', a.emergency_contact_name,
            'emergency_contact_phone', a.emergency_contact_phone
        )
    ) INTO v_out
    FROM athletes a WHERE a.id = v_req.athlete_id;

    RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION coach_schedule_items(p_coach_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    slot_id          UUID,
    starts_at        TIMESTAMPTZ,
    ends_at          TIMESTAMPTZ,
    seats_total      INT,
    facility_label   TEXT,
    facility_address TEXT,
    facility_status  TEXT,
    status           TEXT,
    attendees        JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH entries AS (
        SELECT b.slot_id, 'booking'::text AS kind, b.id, b.status,
               b.athlete_id, b.parent_user_id, r.session_type_id, r.notes, r.film_links,
               b.price_cents, b.payment_status, b.payment_method, b.paid_at
        FROM bookings b
        JOIN booking_requests r ON r.id = b.request_id
        WHERE b.coach_id = p_coach_id AND b.status IN ('confirmed', 'completed', 'no_show')
        UNION ALL
        SELECT r.slot_id, 'request', r.id, r.status,
               r.athlete_id, r.parent_user_id, r.session_type_id, r.notes, r.film_links,
               st.price_cents, NULL, NULL, NULL
        FROM booking_requests r
        JOIN session_types st ON st.id = r.session_type_id
        WHERE r.coach_id = p_coach_id AND r.status = 'requested'
    )
    SELECT s.id, s.starts_at, s.ends_at, s.seats_total,
           f.label, f.address, s.facility_status,
           CASE WHEN bool_or(e.kind = 'booking') THEN 'booked' ELSE 'pending' END,
           jsonb_agg(jsonb_build_object(
               'kind', e.kind,
               'id', e.id,
               'status', e.status,
               'athlete_name', COALESCE(NULLIF(trim(a.first_name || ' ' || COALESCE(a.last_name, '')), ''), 'Athlete'),
               'athlete_profile', jsonb_build_object(
                   'grad_year', a.grad_year, 'positions', a.positions, 'level', a.level,
                   'club_team', a.club_team, 'height_inches', a.height_inches, 'goals', a.goals,
                   'allergies', a.allergies, 'medical_notes', a.medical_notes,
                   'emergency_contact_name', a.emergency_contact_name,
                   'emergency_contact_phone', a.emergency_contact_phone),
               'parent_name', up.display_name,
               'parent_email', u.email,
               'session_type', st.name,
               'session_kind', st.kind,
               'notes', e.notes,
               'film_links', e.film_links,
               'price_cents', e.price_cents,
               'payment_status', e.payment_status,
               'payment_method', e.payment_method,
               'paid_at', e.paid_at
           ) ORDER BY e.kind, a.first_name)
    FROM slots s
    JOIN entries e ON e.slot_id = s.id
    LEFT JOIN facilities f ON f.id = s.facility_id
    LEFT JOIN athletes a ON a.id = e.athlete_id
    LEFT JOIN user_profiles up ON up.id = e.parent_user_id
    LEFT JOIN auth.users u ON u.id = e.parent_user_id
    LEFT JOIN session_types st ON st.id = e.session_type_id
    WHERE s.coach_id = p_coach_id
      AND s.starts_at >= p_from AND s.starts_at < p_to
    GROUP BY s.id, f.label, f.address
    ORDER BY s.starts_at;
$$;
