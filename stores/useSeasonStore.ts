import { create } from 'zustand';
import type { Tournament, HotelBooking, FlightBooking, TeamConfig, USAVProfile, ForwardedEmail } from '@/types/database';

interface SeasonState {
  tournaments: Tournament[];
  hotelBookings: HotelBooking[];
  flightBookings: FlightBooking[];
  teamConfig: TeamConfig | null;
  usavProfiles: USAVProfile[];
  forwardedEmails: ForwardedEmail[];
  isLoading: boolean;

  setTournaments: (tournaments: Tournament[]) => void;
  addTournament: (tournament: Tournament) => void;
  updateTournament: (id: string, updates: Partial<Tournament>) => void;

  setHotelBookings: (bookings: HotelBooking[]) => void;
  addHotelBooking: (booking: HotelBooking) => void;
  updateHotelBooking: (id: string, updates: Partial<HotelBooking>) => void;
  removeHotelBooking: (id: string) => void;

  setFlightBookings: (bookings: FlightBooking[]) => void;
  addFlightBooking: (booking: FlightBooking) => void;
  updateFlightBooking: (id: string, updates: Partial<FlightBooking>) => void;
  removeFlightBooking: (id: string) => void;

  removeTournament: (id: string) => void;

  setTeamConfig: (config: TeamConfig | null) => void;
  setUSAVProfiles: (profiles: USAVProfile[]) => void;
  addUSAVProfile: (profile: USAVProfile) => void;
  updateUSAVProfile: (id: string, updates: Partial<USAVProfile>) => void;
  removeUSAVProfile: (id: string) => void;
  setForwardedEmails: (emails: ForwardedEmail[]) => void;
  addForwardedEmail: (email: ForwardedEmail) => void;
  updateForwardedEmail: (id: string, updates: Partial<ForwardedEmail>) => void;
  setLoading: (loading: boolean) => void;
}

export const useSeasonStore = create<SeasonState>((set) => ({
  tournaments: [],
  hotelBookings: [],
  flightBookings: [],
  teamConfig: null,
  usavProfiles: [],
  forwardedEmails: [],
  isLoading: false,

  setTournaments: (tournaments) => set({ tournaments }),
  addTournament: (tournament) =>
    set((state) => ({ tournaments: [...state.tournaments, tournament] })),
  updateTournament: (id, updates) =>
    set((state) => ({
      tournaments: state.tournaments.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  setHotelBookings: (hotelBookings) => set({ hotelBookings }),
  addHotelBooking: (booking) =>
    set((state) => ({ hotelBookings: [...state.hotelBookings, booking] })),
  updateHotelBooking: (id, updates) =>
    set((state) => ({
      hotelBookings: state.hotelBookings.map((h) =>
        h.id === id ? { ...h, ...updates } : h
      ),
    })),
  removeHotelBooking: (id) =>
    set((state) => ({ hotelBookings: state.hotelBookings.filter((h) => h.id !== id) })),

  setFlightBookings: (flightBookings) => set({ flightBookings }),
  addFlightBooking: (booking) =>
    set((state) => ({ flightBookings: [...state.flightBookings, booking] })),
  updateFlightBooking: (id, updates) =>
    set((state) => ({
      flightBookings: state.flightBookings.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  removeFlightBooking: (id) =>
    set((state) => ({ flightBookings: state.flightBookings.filter((f) => f.id !== id) })),

  removeTournament: (id) =>
    set((state) => ({ tournaments: state.tournaments.filter((t) => t.id !== id) })),

  setTeamConfig: (teamConfig) => set({ teamConfig }),
  setUSAVProfiles: (usavProfiles) => set({ usavProfiles }),
  addUSAVProfile: (profile) =>
    set((state) => ({ usavProfiles: [...state.usavProfiles, profile] })),
  updateUSAVProfile: (id, updates) =>
    set((state) => ({
      usavProfiles: state.usavProfiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),
  removeUSAVProfile: (id) =>
    set((state) => ({ usavProfiles: state.usavProfiles.filter((p) => p.id !== id) })),
  setForwardedEmails: (forwardedEmails) => set({ forwardedEmails }),
  addForwardedEmail: (email) =>
    set((state) => ({ forwardedEmails: [email, ...state.forwardedEmails] })),
  updateForwardedEmail: (id, updates) =>
    set((state) => ({
      forwardedEmails: state.forwardedEmails.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
