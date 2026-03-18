-- Tournament tickets: individual ticket purchases per tournament
CREATE TABLE tournament_tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id       UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    created_by_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticket_holder_name  TEXT NOT NULL,
    ticket_type         TEXT,              -- e.g. "Entire Event - Adult"
    ticket_id           TEXT,              -- platform ticket ID
    order_id            TEXT,              -- platform order ID
    ticket_url          TEXT,              -- direct link to ticket / order
    ticket_price        NUMERIC(10,2),
    sales_tax           NUMERIC(10,2),
    total_cost          NUMERIC(10,2),
    order_date          DATE,
    age_category        TEXT,              -- e.g. "Ages 19 & older"
    photo_required      BOOLEAN DEFAULT false,
    refund_policy       TEXT,
    parking_notes       TEXT,
    source_email_id     UUID REFERENCES forwarded_emails(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournament_tickets_tournament ON tournament_tickets(tournament_id);
CREATE INDEX idx_tournament_tickets_user ON tournament_tickets(created_by_user_id);

-- RLS: same pattern as hotel/flight bookings
ALTER TABLE tournament_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read accessible tickets"
    ON tournament_tickets FOR SELECT
    USING (
        tournament_id IN (
            SELECT t.id FROM tournaments t WHERE t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users insert tickets"
    ON tournament_tickets FOR INSERT
    WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Users update accessible tickets"
    ON tournament_tickets FOR UPDATE
    USING (
        tournament_id IN (
            SELECT t.id FROM tournaments t WHERE t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users delete own tickets"
    ON tournament_tickets FOR DELETE
    USING (auth.uid() = created_by_user_id);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tournament_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
