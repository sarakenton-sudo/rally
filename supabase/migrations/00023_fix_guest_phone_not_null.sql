-- Fix: phone column on guests is NOT NULL but RPC inserts NULL for empty phone.
-- Make phone nullable (it's optional — not all guests have phone numbers).
ALTER TABLE guests ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE guests ALTER COLUMN phone SET DEFAULT '';
