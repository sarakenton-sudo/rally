-- Add notes column to hotel_bookings
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Add THS to booking_platform enum
ALTER TYPE booking_platform ADD VALUE IF NOT EXISTS 'THS';
