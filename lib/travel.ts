import type { FlightBooking } from '@/types/database';

/**
 * A tournament's flights are "one-way only" when there's a single booking with
 * no return date: the trip home still needs booking. (Two one-way bookings,
 * out and back, count as booked.)
 */
export function isOneWayOnly(flights: Pick<FlightBooking, 'return_date'>[]): boolean {
  return flights.length === 1 && !flights[0].return_date;
}
