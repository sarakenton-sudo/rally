import { resetStores } from '@/lib/resetStores';
import { useCoachStore } from '@/stores/useCoachStore';
import { useSeasonStore } from '@/stores/useSeasonStore';

describe('resetStores (switching accounts in one tab)', () => {
  it("drops the previous account's coach profile and family data", () => {
    useCoachStore.getState().setCoachProfile({ id: 'old-coach', user_id: 'old-user' } as any);
    useSeasonStore.setState({ athletes: [{ id: 'a1' } as any], activeSeasonId: 's1' });
    resetStores();
    expect(useCoachStore.getState().coachProfile).toBeNull();
    expect(useSeasonStore.getState().athletes).toEqual([]);
    expect(useSeasonStore.getState().activeSeasonId).toBeNull();
    expect(typeof useCoachStore.getState().setCoachProfile).toBe('function'); // actions survive
  });
});
