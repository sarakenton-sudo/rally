import { create } from 'zustand';
import type {
  Coach, SessionType, AvailabilityRule, Slot,
  CoachConnection, BookingRequest, Booking,
} from '@/types/database';

interface CoachState {
  // Coach-side data (the logged-in user's own coaching business)
  coachProfile: Coach | null;
  sessionTypes: SessionType[];
  availabilityRules: AvailabilityRule[];
  slots: Slot[];
  connections: CoachConnection[];
  requests: BookingRequest[];
  bookings: Booking[];
  isLoadingCoach: boolean;

  setCoachProfile: (coach: Coach | null) => void;
  updateCoachProfile: (updates: Partial<Coach>) => void;
  setSessionTypes: (types: SessionType[]) => void;
  addSessionType: (type: SessionType) => void;
  updateSessionType: (id: string, updates: Partial<SessionType>) => void;
  removeSessionType: (id: string) => void;
  setAvailabilityRules: (rules: AvailabilityRule[]) => void;
  setSlots: (slots: Slot[]) => void;
  setConnections: (connections: CoachConnection[]) => void;
  setRequests: (requests: BookingRequest[]) => void;
  setBookings: (bookings: Booking[]) => void;
  setLoadingCoach: (loading: boolean) => void;
}

export const useCoachStore = create<CoachState>((set) => ({
  coachProfile: null,
  sessionTypes: [],
  availabilityRules: [],
  slots: [],
  connections: [],
  requests: [],
  bookings: [],
  isLoadingCoach: false,

  setCoachProfile: (coachProfile) => set({ coachProfile }),
  updateCoachProfile: (updates) =>
    set((state) => ({ coachProfile: state.coachProfile ? { ...state.coachProfile, ...updates } : null })),
  setSessionTypes: (sessionTypes) => set({ sessionTypes }),
  addSessionType: (type) => set((state) => ({ sessionTypes: [...state.sessionTypes, type] })),
  updateSessionType: (id, updates) =>
    set((state) => ({
      sessionTypes: state.sessionTypes.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeSessionType: (id) =>
    set((state) => ({ sessionTypes: state.sessionTypes.filter((t) => t.id !== id) })),
  setAvailabilityRules: (availabilityRules) => set({ availabilityRules }),
  setSlots: (slots) => set({ slots }),
  setConnections: (connections) => set({ connections }),
  setRequests: (requests) => set({ requests }),
  setBookings: (bookings) => set({ bookings }),
  setLoadingCoach: (isLoadingCoach) => set({ isLoadingCoach }),
}));
