import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/hooks/useAdminAuth';

/** Platform settings — currently the lesson take rate (platform_settings, 00071/00073). */
export function Settings() {
  const { admin } = useAdminAuth();
  const isOwner = admin?.role === 'owner';
  const [bps, setBps] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pct, setPct] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('platform_settings').select('platform_fee_bps, updated_at').maybeSingle();
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setBps(data?.platform_fee_bps ?? 0);
    setUpdatedAt(data?.updated_at ?? null);
    setPct(String((data?.platform_fee_bps ?? 0) / 100));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const value = Number(pct);
    if (!Number.isFinite(value) || value < 0 || value > 50) {
      setMsg({ ok: false, text: 'Enter a percentage between 0 and 50.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    const next = Math.round(value * 100);
    const { data, error } = await supabase
      .from('platform_settings')
      .update({ platform_fee_bps: next, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('platform_fee_bps');
    setSaving(false);
    if (error || !data?.length) {
      setMsg({ ok: false, text: error?.message ?? 'Not saved — only owners can change the take rate.' });
      return;
    }
    setMsg({ ok: true, text: `Saved. New lessons are charged at ${next / 100}%.` });
    load();
  };

  const example = (priceCents: number, b: number) => (priceCents * b) / 10000 / 100;
  const previewBps = Math.round((Number(pct) || 0) * 100);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-bark mb-1">Settings</h1>
      <p className="text-sm text-stone mb-6">Platform-wide settings for RallyHUB.</p>

      <section className="rounded-xl border border-frost bg-white p-6">
        <h2 className="text-lg font-semibold text-bark">Lesson take rate</h2>
        <p className="text-sm text-stone mt-1 mb-4">
          RallyHUB's cut of each lesson paid in the app. Stripe's processing fee is separate: the coach covers it or passes it to the family, per their own setting.
        </p>

        {bps === null ? (
          <p className="text-sm text-stone">Loading…</p>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <label className="flex flex-col text-sm">
                <span className="text-stone mb-1">Take rate</span>
                <div className="flex items-center rounded-lg border border-frost px-3 py-2 focus-within:border-rally-500">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={pct}
                    disabled={!isOwner}
                    onChange={(e) => { setPct(e.target.value); setMsg(null); }}
                    className="w-20 outline-none text-lg font-semibold text-bark disabled:bg-transparent"
                  />
                  <span className="text-lg text-stone">%</span>
                </div>
              </label>
              {isOwner && (
                <button
                  onClick={save}
                  disabled={saving || previewBps === bps}
                  className="rounded-lg bg-rally-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>

            <p className="text-sm text-bark mt-4">
              On an $80 lesson: RallyHUB earns <strong>${example(8000, previewBps).toFixed(2)}</strong>, and the coach keeps <strong>${(80 - example(8000, previewBps)).toFixed(2)}</strong> before Stripe's fee.
            </p>
            <p className="text-xs text-stone mt-2">
              Currently {bps / 100}%{updatedAt ? ` · last changed ${new Date(updatedAt).toLocaleString()}` : ''}. Changes apply to lessons charged from now on; past charges keep their original fee.
            </p>
            {!isOwner && <p className="text-xs text-amber-700 mt-2">Only owners can change the take rate.</p>}
            {msg && <p className={`text-sm mt-3 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
          </>
        )}
      </section>
    </div>
  );
}
