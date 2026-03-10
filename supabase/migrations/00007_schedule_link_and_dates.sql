-- Generalize sportwrench_url to schedule_link (works for any schedule provider)
ALTER TABLE tournaments RENAME COLUMN sportwrench_url TO schedule_link;

-- Date when the tournament schedule will be posted (AI-computed from emails like "Wednesday prior to event")
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS schedule_available_date DATE;

-- Date when ticket sales start for this tournament
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS ticket_sales_date DATE;
