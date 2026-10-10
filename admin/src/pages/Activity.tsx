import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { StatCard } from '@/components/StatCard';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchActivityReport, fetchActivityDay } from '@/lib/queries';

const RANGES = [7, 30, 90] as const;

// Metrics you can trend (daily series from admin_activity_report).
const METRICS: { key: string; label: string; color: string; group: 'People' | 'Families' | 'Coaching' }[] = [
  { key: 'active_users', label: 'Active people', color: '#1E3A5F', group: 'People' },
  { key: 'active_iphone', label: 'Active on iPhone', color: '#3B82B0', group: 'People' },
  { key: 'active_web', label: 'Active on web', color: '#8FA8BF', group: 'People' },
  { key: 'signups', label: 'All sign-ups', color: '#FF7A59', group: 'People' },
  { key: 'parent_signups', label: 'Parent sign-ups', color: '#E85F3D', group: 'People' },
  { key: 'fans_joined', label: 'Fans joined', color: '#DB2777', group: 'People' },
  { key: 'tournaments', label: 'Tournaments added', color: '#6A9E8A', group: 'Families' },
  { key: 'games', label: 'Games added', color: '#0f766e', group: 'Families' },
  { key: 'travel', label: 'Hotels + flights', color: '#ca8a04', group: 'Families' },
  { key: 'emails_forwarded', label: 'Emails forwarded', color: '#d97706', group: 'Families' },
  { key: 'coach_signups', label: 'Coach sign-ups', color: '#7c3aed', group: 'Coaching' },
  { key: 'open_times', label: 'Open times added', color: '#16a34a', group: 'Coaching' },
  { key: 'lesson_requests', label: 'Lesson requests', color: '#be185d', group: 'Coaching' },
  { key: 'lessons_booked', label: 'Lessons booked', color: '#4f46e5', group: 'Coaching' },
  { key: 'lessons_paid', label: 'Lessons paid', color: '#15803d', group: 'Coaching' },
];
const DEFAULT_METRICS = ['active_users', 'signups', 'coach_signups', 'lessons_booked'];

// Friendly names for tracked actions (anything new shows its raw name).
const EVENT_LABELS: Record<string, string> = {
  app_open: 'Opened the app', onboarding_completed: 'Finished setup',
  tournament_added: 'Added a tournament', tournament_deleted: 'Deleted a tournament', season_deleted: 'Deleted a season',
  team_event_added: 'Added a game/event', team_event_deleted: 'Deleted a game/event',
  hotel_added: 'Added a hotel', flight_added: 'Added a flight',
  import_attempt: 'Started an import', import_completed: 'Finished an import', paste_submitted: 'Pasted text', paste_parsed: 'Paste understood', paste_unclassified: 'Paste not understood',
  credential_saved: 'Saved a login',
  fan_invited: 'Invited a fan', fan_joined: 'Fan joined', fan_removed: 'Removed a fan', fan_update_sent: 'Sent fans an update',
  referral_copied: 'Copied a referral', referral_emailed: 'Emailed a referral', coach_invite_sent: 'Parent invited a coach', coach_referral_shared: 'Coach shared with a coach',
  coach_signup: 'Coach created a page', coach_facility_added: 'Coach added a facility', coach_session_type_added: 'Coach added a lesson type',
  coach_availability_added: 'Coach added open times', coach_group_added: 'Coach added a group', coach_client_added: 'Coach added a client', coach_announce_sent: 'Coach announced open times', coach_terms_signed: 'Family signed coach terms',
  lesson_requested: 'Family requested a lesson', lesson_booked_by_coach: 'Coach booked a lesson', lesson_request_approved: 'Coach approved a request', lesson_request_declined: 'Coach declined a request',
  lesson_cancelled: 'Lesson cancelled', lesson_move_proposed: 'Lesson move asked', lesson_move_answered: 'Lesson move answered', lesson_marked_paid: 'Lesson marked paid', lesson_cleared_from_home: 'Cleared a cancelled lesson',
};

const fmtMoney = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-bark">{title}</h2>
      {note ? <p className="mb-3 mt-0.5 text-xs text-stone">{note}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function PairTable({ rows }: { rows: [string, [number, number] | number][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-frost bg-warm-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-frost text-left text-stone"><th className="p-3 font-medium">What</th><th className="p-3 text-right font-medium">In this period</th><th className="p-3 text-right font-medium">All time</th></tr></thead>
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label} className="border-b border-frost last:border-0">
              <td className="p-3 text-bark">{label}</td>
              <td className="p-3 text-right font-semibold tabular-nums text-bark">{Array.isArray(v) ? v[1] : v}</td>
              <td className="p-3 text-right tabular-nums text-stone">{Array.isArray(v) ? v[0] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const top = steps[0]?.[1] ?? 0;
  return (
    <div className="space-y-2 rounded-xl border border-frost bg-warm-white p-4">
      {steps.map(([label, n], i) => (
        <div key={label}>
          <div className="flex justify-between text-sm"><span className="text-bark">{label}</span><span className="tabular-nums text-stone">{n} · {pct(n, top)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-frost"><div className="h-2 rounded-full" style={{ width: top ? `${(n / top) * 100}%` : '0%', background: i === 0 ? '#1E3A5F' : '#FF7A59' }} /></div>
        </div>
      ))}
      {top === 0 ? <p className="text-xs text-stone">Nobody signed up in this period.</p> : null}
    </div>
  );
}

export function Activity() {
  const [days, setDays] = useState<number>(30);
  const { data: r, loading, error } = useAdminData(() => fetchActivityReport(days), [days]);
  const [shown, setShown] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('rally.admin.metrics') ?? ''); if (Array.isArray(v) && v.length) return v; } catch { /* default */ }
    return DEFAULT_METRICS;
  });
  const toggle = (k: string) => {
    const next = shown.includes(k) ? shown.filter((x) => x !== k) : [...shown, k];
    setShown(next);
    try { localStorage.setItem('rally.admin.metrics', JSON.stringify(next)); } catch { /* fine */ }
  };
  const [day, setDay] = useState<string | null>(null);
  const { data: dayData, loading: dayLoading } = useAdminData(() => (day ? fetchActivityDay(day) : Promise.resolve(null)), [day]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bark">Activity</h1>
          <p className="text-sm text-stone">What people are doing in RallyHUB, from the iPhone app, the website and email.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-frost bg-warm-white p-1">
          {RANGES.map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${days === d ? 'bg-bark text-white' : 'text-stone hover:text-bark'}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {loading && !r ? <p className="text-sm text-stone">Loading…</p> : error ? <p className="text-sm text-red-600">Couldn't load the report: {error}</p> : r ? (
        <>
          <Section title="People" note="Active = opened the app or website (tracked from this release on). Signed in = last sign-in date.">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Users" value={r.people.users_total} sublabel={`+${r.people.users_new} in ${r.days} days`} />
              <StatCard label="Active today" value={r.people.active_today} sublabel={`${r.people.active_7d} this week · ${r.people.active_30d} this month`} />
              <StatCard label="Signed in (7d / 30d)" value={`${r.people.signed_in_7d} / ${r.people.signed_in_30d}`} />
              <StatCard label="Parents · Coaches · Fans" value={`${r.people.parents_total} · ${r.people.coaches_total} · ${r.people.fans_total}`} sublabel={`${r.people.athlete_logins} athlete logins`} />
            </div>
            {Object.keys(r.people.active_by_platform ?? {}).length ? (
              <p className="mt-3 text-sm text-stone">Active people by platform: {Object.entries(r.people.active_by_platform).map(([k, v]) => `${k === 'ios' ? 'iPhone' : k === 'web' ? 'Web' : k} ${v}`).join(' · ')}</p>
            ) : null}
          </Section>

          <Section title="Trends" note="Pick what to chart. Your picks are remembered on this computer.">
            <div className="mb-3 space-y-2">
              {(['People', 'Families', 'Coaching'] as const).map((grp) => (
                <div key={grp} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-semibold uppercase tracking-wider text-stone">{grp}</span>
                  {METRICS.filter((m) => m.group === grp).map((m) => {
                    const on = shown.includes(m.key);
                    return (
                      <button key={m.key} onClick={() => toggle(m.key)} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ background: on ? m.color : '#fff', borderColor: on ? m.color : '#D8E2EC', color: on ? '#fff' : '#1E3A5F' }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-frost bg-warm-white p-4">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={r.daily} onClick={(e: any) => { if (e?.activeLabel) setDay(e.activeLabel); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8E2EC" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#4A6E8A' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4A6E8A' }} />
                  <Tooltip />
                  <Legend />
                  {METRICS.filter((m) => shown.includes(m.key)).map((m) => (
                    <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-1 text-xs text-stone">Click a day on the chart or in the table below to see who did what.</p>
            </div>
          </Section>

          <Section title="Daily metrics" note="Newest first. Click a day for who.">
            <div className="overflow-x-auto rounded-xl border border-frost bg-warm-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-frost text-left text-stone">
                  <th className="p-2.5 font-medium">Day</th>
                  {METRICS.map((m) => <th key={m.key} className="whitespace-nowrap p-2.5 text-right font-medium">{m.label}</th>)}
                </tr></thead>
                <tbody>
                  {[...r.daily].reverse().map((d) => (
                    <tr key={d.day} onClick={() => setDay(d.day)} className={`cursor-pointer border-b border-frost last:border-0 hover:bg-cream ${day === d.day ? 'bg-cream' : ''}`}>
                      <td className="whitespace-nowrap p-2.5 font-semibold text-bark">{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      {METRICS.map((m) => <td key={m.key} className={`p-2.5 text-right tabular-nums ${d[m.key] ? 'text-bark' : 'text-frost'}`}>{d[m.key] ?? 0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {day ? (
            <Section title={`Who · ${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`} note="Tracked actions that day (admin 'log in as' sessions left out), sign-ups and what was added.">
              <div className="rounded-xl border border-frost bg-warm-white p-4">
                <div className="mb-3 flex justify-end"><button onClick={() => setDay(null)} className="text-xs font-semibold text-stone hover:text-bark">Close</button></div>
                {dayLoading || !dayData ? <p className="text-sm text-stone">Loading…</p> : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(dayData.added).map(([k, v]) => <span key={k} className="rounded-full bg-cream px-3 py-1 text-bark">{k.replace(/_/g, ' ')}: <b>{v}</b></span>)}
                    </div>
                    {dayData.signups.length ? (
                      <div><h3 className="mb-1 text-sm font-semibold text-bark">Signed up</h3>
                        <ul className="text-sm text-stone">{dayData.signups.map((s) => <li key={s.email}>{s.email} · {s.type ?? '—'} · {new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</li>)}</ul></div>
                    ) : null}
                    <div><h3 className="mb-1 text-sm font-semibold text-bark">People</h3>
                      {dayData.people.length === 0 ? <p className="text-sm text-stone">No tracked actions that day.</p> : (
                        <table className="w-full text-sm"><tbody>
                          {dayData.people.map((p) => (
                            <tr key={p.email} className="border-b border-frost last:border-0 align-top">
                              <td className="py-2 pr-3 text-bark">{p.email}<div className="text-xs text-stone">{p.account_type ?? '—'} · {p.platforms.replace('ios', 'iPhone')}</div></td>
                              <td className="py-2 pr-3 text-right tabular-nums">{p.actions}</td>
                              <td className="py-2 text-xs text-stone">{p.did.split(', ').map((x) => EVENT_LABELS[x] ?? x).join(' · ')}</td>
                            </tr>
                          ))}
                        </tbody></table>
                      )}
                    </div>
                    <details><summary className="cursor-pointer text-sm font-semibold text-bark">Every action ({dayData.actions.length})</summary>
                      <table className="mt-2 w-full text-xs"><tbody>
                        {dayData.actions.map((a, i) => (
                          <tr key={i} className="border-b border-frost last:border-0">
                            <td className="py-1.5 pr-2 tabular-nums text-stone">{new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                            <td className="py-1.5 pr-2 text-bark">{a.email}</td>
                            <td className="py-1.5 pr-2">{EVENT_LABELS[a.event_type] ?? a.event_type}</td>
                            <td className="py-1.5 text-stone">{a.platform === 'ios' ? 'iPhone' : a.platform}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    </details>
                  </div>
                )}
              </div>
            </Section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Families added" note="Counted from the data, however it was added (app, web or email).">
              <PairTable rows={[
                ['Athletes', r.content.athletes], ['Tournaments', r.content.tournaments], ['Games & team events', r.content.games_events],
                ['Hotels', r.content.hotels], ['Flights', r.content.flights], ['Emails forwarded to plans@', r.content.emails_forwarded],
                ['Fans invited', r.content.fans_invited], ['Fans joined', r.content.fans_joined], ['Updates sent to fans', r.content.fan_updates],
              ]} />
            </Section>
            <Section title="Coaching">
              <PairTable rows={[
                ['Coach pages', r.coaching.coaches], ['Booking pages live', r.coaching.booking_pages_live], ['Open times added', r.coaching.open_times_added],
                ['Families connected', r.coaching.families_connected], ['Lesson requests', r.coaching.lesson_requests], ['Lessons booked', r.coaching.lessons_booked],
                ['Lessons cancelled', r.coaching.lessons_cancelled], ['Lessons marked paid', r.coaching.lessons_paid],
                ['Booked value', fmtMoney(r.coaching.booked_cents) as any], ['Paid value', fmtMoney(r.coaching.paid_cents) as any],
              ]} />
              {Object.keys(r.coaching.requests_by_status ?? {}).length ? (
                <p className="mt-2 text-xs text-stone">Requests this period: {Object.entries(r.coaching.requests_by_status).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
              ) : null}
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Parent funnel" note={`Parents who signed up in the last ${r.days} days.`}>
              <Funnel steps={[
                ['Signed up', r.parent_funnel.signed_up], ['Finished setup', r.parent_funnel.finished_setup], ['Added a tournament', r.parent_funnel.added_tournament],
                ['Added travel', r.parent_funnel.added_travel], ['Invited a fan', r.parent_funnel.invited_fan], ['Requested a lesson', r.parent_funnel.booked_lesson],
              ]} />
            </Section>
            <Section title="Coach funnel" note={`Coaches who signed up in the last ${r.days} days.`}>
              <Funnel steps={[
                ['Signed up', r.coach_funnel.signed_up], ['Created a page', r.coach_funnel.created_page], ['Added lesson types', r.coach_funnel.added_lesson_types],
                ['Added open times', r.coach_funnel.added_open_times], ['Published booking page', r.coach_funnel.published_page], ['Got a first booking', r.coach_funnel.first_booking],
              ]} />
            </Section>
          </div>

          <Section title="Actions by platform" note="iPhone counts start with the next TestFlight build (earlier app versions don't record the platform, so they show as Unknown). Web is recorded now.">
            <div className="overflow-x-auto rounded-xl border border-frost bg-warm-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-frost text-left text-stone">
                  <th className="p-3 font-medium">Action</th><th className="p-3 text-right font-medium">Total</th><th className="p-3 text-right font-medium">People</th>
                  <th className="p-3 text-right font-medium">iPhone app</th><th className="p-3 text-right font-medium">Web</th><th className="p-3 text-right font-medium">Unknown (older app)</th>
                </tr></thead>
                <tbody>
                  {r.events.length === 0 ? <tr><td colSpan={6} className="p-3 text-stone">No tracked actions in this period yet.</td></tr> : r.events.map((e) => (
                    <tr key={e.event_type} className="border-b border-frost last:border-0">
                      <td className="p-3 text-bark">{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-bark">{e.total}</td>
                      <td className="p-3 text-right tabular-nums text-stone">{e.users}</td>
                      <td className="p-3 text-right tabular-nums">{e.ios + e.android}</td>
                      <td className="p-3 text-right tabular-nums">{e.web}</td>
                      <td className="p-3 text-right tabular-nums text-stone">{e.unknown}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Most active people" note="By tracked actions in this period.">
            <div className="overflow-x-auto rounded-xl border border-frost bg-warm-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-frost text-left text-stone"><th className="p-3 font-medium">Email</th><th className="p-3 font-medium">Type</th><th className="p-3 text-right font-medium">Actions</th><th className="p-3 font-medium">Mostly on</th><th className="p-3 font-medium">Last seen</th></tr></thead>
                <tbody>
                  {r.top_users.map((u) => (
                    <tr key={u.email} className="border-b border-frost last:border-0">
                      <td className="p-3 text-bark">{u.email}</td>
                      <td className="p-3 text-stone">{u.account_type ?? '—'}</td>
                      <td className="p-3 text-right tabular-nums">{u.actions}</td>
                      <td className="p-3 text-stone">{u.platform === 'ios' ? 'iPhone' : u.platform === 'web' ? 'Web' : u.platform ?? '—'}</td>
                      <td className="p-3 text-stone">{new Date(u.last_seen).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <p className="text-xs text-stone">Updated {new Date(r.generated_at).toLocaleString()}</p>
        </>
      ) : null}
    </div>
  );
}
