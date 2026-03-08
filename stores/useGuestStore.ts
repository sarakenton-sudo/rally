import { create } from 'zustand';
import type { Guest, TournamentGuest } from '@/types/database';

interface GuestState {
  guests: Guest[];
  tournamentGuests: TournamentGuest[];

  setGuests: (guests: Guest[]) => void;
  addGuest: (guest: Guest) => void;
  updateGuest: (id: string, updates: Partial<Guest>) => void;
  removeGuest: (id: string) => void;

  setTournamentGuests: (tg: TournamentGuest[]) => void;
  addTournamentGuest: (tg: TournamentGuest) => void;
  updateRSVP: (tournamentId: string, guestId: string, updates: Partial<TournamentGuest>) => void;
}

export const useGuestStore = create<GuestState>((set) => ({
  guests: [],
  tournamentGuests: [],

  setGuests: (guests) => set({ guests }),
  addGuest: (guest) => set((state) => ({ guests: [...state.guests, guest] })),
  updateGuest: (id, updates) =>
    set((state) => ({
      guests: state.guests.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    })),
  removeGuest: (id) =>
    set((state) => ({ guests: state.guests.filter((g) => g.id !== id) })),

  setTournamentGuests: (tournamentGuests) => set({ tournamentGuests }),
  addTournamentGuest: (tg) =>
    set((state) => ({ tournamentGuests: [...state.tournamentGuests, tg] })),
  updateRSVP: (tournamentId, guestId, updates) =>
    set((state) => ({
      tournamentGuests: state.tournamentGuests.map((tg) =>
        tg.tournament_id === tournamentId && tg.guest_id === guestId
          ? { ...tg, ...updates }
          : tg
      ),
    })),
}));
