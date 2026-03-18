-- Allow one-way flights by making return_date nullable
ALTER TABLE flight_bookings ALTER COLUMN return_date DROP NOT NULL;
