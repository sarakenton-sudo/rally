import { useCallback, useState } from 'react';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { fetchMyCoaches, fetchMyLessonHistory, isSupabaseConfigured } from '@/lib/coach';
import { getPlusSheetOrder, type PlusContext, type PlusSheetOrder, type PlusTournament } from '@/lib/plusSheet';
import type { HotelBooking, Tournament } from '@/types/database';

/** Travel still needed: no hotel, or a backup hotel not yet resolved (spec §4.1). */
export function tournamentNeedsTravel(t: Tournament, hotels: HotelBooking[]): boolean {
  if (!t.travel_required) return false;
  const mine = hotels.filter((h) => h.tournament_id === t.id);
  const noHotel = !t.hotel_not_needed && mine.filter((h) => !h.is_backup).length === 0;
  return noHotel || mine.some((h) => h.is_backup);
}

/** Next upcoming tournament (by start date) that still needs travel — default for Add travel. */
export function nextTournamentNeedingTravel(tournaments: Tournament[], hotels: HotelBooking[], now = new Date()): Tournament | null {
  const today = now.toISOString().slice(0, 10);
  return [...tournaments]
    .filter((t) => t.end_date >= today && tournamentNeedsTravel(t, hotels))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
}

/** Builds PlusContext from stores + lesson/coach data; call refresh() when the sheet opens. */
export function usePlusSheetOrder() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const [remote, setRemote] = useState<{ lessons: PlusContext['lessons']; coachCount: number }>({ lessons: [], coachCount: 0 });

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const [lessons, coaches] = await Promise.all([fetchMyLessonHistory(), fetchMyCoaches()]);
    setRemote({ lessons, coachCount: coaches.data.length });
  }, []);

  const ctx: PlusContext = {
    now: new Date(),
    tournaments: tournaments.map((t): PlusTournament => ({
      id: t.id, name: t.name, start_date: t.start_date, needsTravel: tournamentNeedsTravel(t, hotelBookings),
    })),
    lessons: remote.lessons,
    connectedCoachCount: remote.coachCount,
    athleteCount: athletes.length,
    seasonCount: seasons.length,
  };
  const order: PlusSheetOrder = getPlusSheetOrder(ctx);
  return { order, refresh, hasCoach: remote.coachCount > 0, nextTravel: nextTournamentNeedingTravel(tournaments, hotelBookings) };
}
