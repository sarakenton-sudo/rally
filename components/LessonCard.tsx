import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { sessionKindStyle, type ParentLesson } from '@/lib/coach';

/** A parent's lesson in a timeline (Home "Coming up", Schedule). */
export default function LessonCard({ lesson, athleteName }: { lesson: ParentLesson; athleteName?: string }) {
  const st = sessionKindStyle(lesson.session_kind);
  const start = new Date(lesson.starts_at);
  const confirmed = lesson.status === 'accepted';
  const off = lesson.status === 'cancelled' || lesson.status === 'declined';
  const tag = off
    ? { label: lesson.status === 'cancelled' ? 'CANCELLED' : 'DECLINED', cls: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' }
    : confirmed
      ? { label: 'CONFIRMED', cls: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' }
      : { label: 'REQUESTED', cls: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' };
  return (
    <Pressable
      onPress={() => router.push('/coaching')}
      className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mb-3 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
      style={{ borderLeftWidth: 4, borderLeftColor: off ? '#dc2626' : st.color, opacity: off ? 0.85 : 1, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
    >
      <View className="w-11 h-11 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: st.color + '15' }}>
        <Text className="text-[10px] font-bold uppercase" style={{ color: st.color }}>
          {start.toLocaleDateString(undefined, { month: 'short' })}
        </Text>
        <Text className="text-base font-bold -mt-0.5" style={{ color: st.color }}>{start.getDate()}</Text>
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-bold text-bark dark:text-cream ${off ? 'line-through' : ''}`} numberOfLines={1}>
          {lesson.session_type ?? st.label}{athleteName ? ` · ${athleteName}` : ''}
        </Text>
        <Text className="text-xs text-stone dark:text-parchment mt-0.5" numberOfLines={1}>
          {start.toLocaleDateString(undefined, { weekday: 'short' })} {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {lesson.coach_name}{lesson.facility ? ` · ${lesson.facility}` : ''}
        </Text>
        {off && lesson.change_reason ? (
          <Text className="text-xs text-red-700 dark:text-red-300 mt-0.5" numberOfLines={2}>"{lesson.change_reason}"</Text>
        ) : null}
      </View>
      <View className={`px-2 py-1 rounded-md ml-2 ${tag.cls}`}>
        <Text className={`text-[10px] font-bold ${tag.text}`}>{tag.label}</Text>
      </View>
    </Pressable>
  );
}
