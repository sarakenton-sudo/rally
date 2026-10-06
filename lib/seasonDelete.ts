import { supabase } from '@/lib/supabase';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateAdminConfig } from '@/hooks/useSupabaseData';

/** What deleting a season removes with it (DB cascades), for the warning. */
export function seasonDeleteWarning(tournamentCount: number): string {
  return `This deletes the team and everything in it: ${tournamentCount} tournament${tournamentCount === 1 ? '' : 's'}, games, hotels and flights. This can't be undone.`;
}

/** Delete a season (cascades to its tournaments, games, hotels, flights) and update the app. */
export async function deleteSeasonAndData(seasonId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('seasons').delete().eq('id', seasonId).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Couldn't delete this season. Only parents who manage the athlete can." };
  const st = useSeasonStore.getState();
  const remaining = st.seasons.filter((s) => s.id !== seasonId);
  st.removeSeason(seasonId);
  st.setTournaments(st.tournaments.filter((t) => t.season_id !== seasonId));
  if (st.activeSeasonId === seasonId) {
    const next = remaining[0]?.id ?? null;
    st.setActiveSeasonId(next);
    if (st.adminConfig) {
      st.setAdminConfig({ ...st.adminConfig, active_season_id: next });
      await updateAdminConfig(st.adminConfig.id, { active_season_id: next });
    }
  }
  return { error: null };
}
