import { useCoachStore } from '@/stores/useCoachStore';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';

/**
 * Clear every in-memory store. Called when the signed-in account changes so
 * the next account never sees (or writes with) the previous one's data —
 * e.g. a stale coach profile made inserts fail RLS with the old coach_id.
 */
export function resetStores() {
  for (const store of [useCoachStore, useSeasonStore, useGuestStore] as const) {
    (store as any).setState((store as any).getInitialState(), true);
  }
}
