-- Add new fields to flight_bookings
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS departure_time TEXT;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS arrival_time TEXT;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS seat_number TEXT;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS flight_number TEXT;

-- Add address to hotel_bookings
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
