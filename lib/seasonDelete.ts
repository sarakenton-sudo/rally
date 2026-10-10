import { track } from '@/lib/track-event';
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
  track('season_deleted');
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

/** Archive (or unarchive) a season: hidden from Home, Schedule, Travel; nothing deleted (00103). */
export async function setSeasonArchived(seasonId: string, archived: boolean): Promise<{ error: string | null }> {
  const { data, error } = await (supabase.from('seasons') as any)
    .update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', seasonId).select('id');
  if (error) return { error: error.message.includes('archived_at') ? 'Archiving needs a quick database update first.' : error.message };
  if (!data?.length) return { error: "Couldn't change this season. Only parents who manage the athlete can." };
  track(archived ? 'season_archived' : 'season_unarchived');
  const st = useSeasonStore.getState();
  if (archived && st.activeSeasonId === seasonId) {
    const next = st.seasons.find((x) => x.id !== seasonId)?.id ?? null;
    st.setActiveSeasonId(next);
    if (st.adminConfig) {
      st.setAdminConfig({ ...st.adminConfig, active_season_id: next });
      await updateAdminConfig(st.adminConfig.id, { active_season_id: next });
    }
  }
  return { error: null };
}
