import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import {
  guessSeason, seasonLabelForDates, seasonMatches, currentSeasonLabel, createSeason,
} from '@/lib/seasons';
import { tapLight } from '@/lib/haptics';
import type { Season } from '@/types/database';

export type TeamChoice =
  | { mode: 'existing'; seasonId: string }
  | { mode: 'new'; athleteId: string; teamName: string; clubName: string; seasonYear: string };

/**
 * Picks the team (season) new tournaments belong to. Guesses from the
 * tournament dates; when no existing team fits (e.g. a new season's schedule),
 * defaults to "New team" pre-filled from the last team.
 */
export function useTeamChoice(dates: string[]) {
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const athletes = useSeasonStore((s) => s.athletes);
  const touched = useRef(false);
  const datesKey = dates.join('|');

  const compute = (): TeamChoice => {
    const guess = guessSeason(seasons, dates, activeSeasonId);
    if (guess) return { mode: 'existing', seasonId: guess.id };
    const last = seasons.find((s) => s.id === activeSeasonId) ?? seasons[0];
    return {
      mode: 'new',
      athleteId: last?.athlete_id ?? athletes[0]?.id ?? '',
      teamName: '',
      clubName: last?.club_name ?? '',
      seasonYear: seasonLabelForDates(dates) ?? currentSeasonLabel(),
    };
  };

  const [choice, setChoiceState] = useState<TeamChoice>(compute);
  // Re-guess when dates change (e.g. parent edits a date) until they pick manually.
  useEffect(() => {
    if (!touched.current) setChoiceState(compute());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, seasons.length]);

  const setChoice = (c: TeamChoice) => { touched.current = true; setChoiceState(c); };
  return { choice, setChoice };
}

/** Returns the season id to save into — creating the team first if needed. */
export async function resolveTeamChoice(choice: TeamChoice): Promise<{ seasonId: string | null; created: Season | null; error: string | null }> {
  if (choice.mode === 'existing') return { seasonId: choice.seasonId, created: null, error: null };
  if (!choice.teamName.trim()) return { seasonId: null, created: null, error: 'Enter a name for the new team.' };
  if (!choice.athleteId) return { seasonId: null, created: null, error: 'Choose which athlete this team is for.' };
  const { data, error } = await createSeason(choice);
  if (error || !data) return { seasonId: null, created: null, error: error?.message ?? "Couldn't create the team." };
  return { seasonId: data.id, created: data, error: null };
}

export default function TeamPicker({ dates, choice, onChange }: {
  dates: string[];
  choice: TeamChoice;
  onChange: (c: TeamChoice) => void;
}) {
  const seasons = useSeasonStore((s) => s.seasons);
  const athletes = useSeasonStore((s) => s.athletes);
  const label = seasonLabelForDates(dates);
  const athleteName = (id: string) => athletes.find((a) => a.id === id)?.first_name ?? '';

  // Teams that fit these dates first, then newest.
  const ordered = useMemo(() => [...seasons].sort((a, b) => {
    const fa = label && seasonMatches(a, label) ? 0 : 1;
    const fb = label && seasonMatches(b, label) ? 0 : 1;
    return fa - fb || b.created_at.localeCompare(a.created_at);
  }), [seasons, label]);

  const newDefaults = (): TeamChoice => {
    const last = seasons[0];
    return {
      mode: 'new',
      athleteId: choice.mode === 'new' ? choice.athleteId : (last?.athlete_id ?? athletes[0]?.id ?? ''),
      teamName: '',
      clubName: last?.club_name ?? '',
      seasonYear: label ?? currentSeasonLabel(),
    };
  };

  const Row = ({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: React.ReactNode }) => (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      className={`flex-row items-center rounded-xl px-3 py-2.5 mb-2 border ${selected ? 'border-rally-600 bg-rally-50 dark:bg-rally-900/30' : 'border-parchment dark:border-rally-900 bg-cream dark:bg-bark'}`}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? '#3B82B0' : '#8FA8BF'} />
      <View className="flex-1 ml-2.5">{children}</View>
    </Pressable>
  );

  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 p-4 mb-4">
      <View className="flex-row items-center mb-1">
        <Ionicons name="people" size={16} color="#3B82B0" />
        <Text className="text-sm font-bold text-bark dark:text-cream ml-1.5">Which team is this for?</Text>
      </View>
      <Text className="text-xs text-stone dark:text-parchment mb-3">
        {label
          ? choice.mode === 'new' && !seasons.some((s) => seasonMatches(s, label))
            ? `These dates are in the ${label} season — you don't have a team for it yet.`
            : `Guessed from the dates (${label} season). Change it if that's wrong.`
          : 'Choose the team these tournaments belong to.'}
      </Text>

      {ordered.map((s) => {
        const fits = !!label && seasonMatches(s, label);
        return (
          <Row key={s.id} selected={choice.mode === 'existing' && choice.seasonId === s.id} onPress={() => onChange({ mode: 'existing', seasonId: s.id })}>
            <View className="flex-row items-center">
              <Text className="text-sm font-semibold text-bark dark:text-cream flex-shrink" numberOfLines={1}>
                {athletes.length > 1 ? `${athleteName(s.athlete_id)} · ` : ''}{s.team_name}
              </Text>
              {label && !fits ? (
                <View className="ml-2 bg-parchment dark:bg-rally-900/40 rounded px-1.5 py-0.5">
                  <Text className="text-[10px] font-bold text-stone">OTHER SEASON</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">
              {s.season_year}{s.club_name ? ` · ${s.club_name}` : ''}
            </Text>
          </Row>
        );
      })}

      <Row selected={choice.mode === 'new'} onPress={() => { if (choice.mode !== 'new') onChange(newDefaults()); }}>
        <View className="flex-row items-center">
          <Ionicons name="add" size={16} color="#3B82B0" />
          <Text className="text-sm font-semibold text-rally-600 ml-1">New team</Text>
        </View>
      </Row>

      {choice.mode === 'new' && (
        <View className="mt-1 pl-1">
          {athletes.length > 1 && (
            <View className="flex-row flex-wrap mb-2">
              {athletes.map((a) => {
                const on = choice.athleteId === a.id;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => onChange({ ...choice, athleteId: a.id })}
                    className={`rounded-full px-3 py-1.5 mr-2 mb-1 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900'}`}
                  >
                    <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-bark dark:text-parchment'}`}>{a.first_name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {([
            ['Team name', 'teamName', 'e.g. AJV 15 Travel'],
            ['Club', 'clubName', 'e.g. Austin Juniors'],
            ['Season', 'seasonYear', 'e.g. YYYY-YYYY'],
          ] as const).map(([lbl, key, ph]) => (
            <View key={key} className="mb-2">
              <Text className="text-xs text-stone mb-1">{lbl}</Text>
              <TextInput
                value={choice[key]}
                onChangeText={(v) => onChange({ ...choice, [key]: v })}
                placeholder={ph}
                placeholderTextColor="#8FA8BF"
                className="bg-cream dark:bg-bark rounded-lg px-3 py-2 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
