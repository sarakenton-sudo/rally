import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import {
  fetchNotificationTemplate,
  fetchTemplateVersions,
  updateNotificationTemplate,
  revertNotificationTemplate,
} from '@/lib/queries';

// ---- Types ----

interface Template {
  id: string;
  slug: string;
  name: string;
  category: string;
  channels: string[];
  title: string;
  body: string;
  is_active: boolean;
  status: string;
  variables: string[];
  updated_at: string;
}

interface Version {
  version: number;
  title: string;
  body: string;
  changed_by_email: string;
  changed_at: string;
  change_note: string | null;
}

// ---- Variable example values for preview ----

const EXAMPLE_VALUES: Record<string, string> = {
  tournament_name: 'AJV 14u Showcase',
  hotel_name: 'Marriott Downtown',
  city: 'Indianapolis',
  date: 'Mar 22, 2026',
  check_in: 'Mar 21, 2026',
  check_out: 'Mar 23, 2026',
  player_name: 'Drue',
  team_name: 'AJV Travel 14u',
  guest_name: 'Grandma Karen',
  cancel_by: 'Mar 15, 2026',
  flight_number: 'DL 1234',
  departure_time: '8:00 AM',
  arrival_time: '10:30 AM',
  court: 'Court 4',
  time: '9:00 AM',
  days_until: '3',
  cost: '$149.00',
  link: 'https://rally.app/t/abc123',
};

function renderPreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return EXAMPLE_VALUES[key] ?? `[${key}]`;
  });
}

// ---- Preview Tabs ----

type PreviewTab = 'ios' | 'android' | 'sms';

function IOSPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-72">
      <div className="rounded-2xl bg-white p-4 shadow-lg">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rally-500">
            <span className="text-[10px] font-bold text-white">R</span>
          </div>
          <span className="text-xs font-semibold text-stone">RALLY</span>
          <span className="ml-auto text-[10px] text-stone">now</span>
        </div>
        <p className="text-sm font-semibold text-bark">{renderPreview(title)}</p>
        <p className="mt-0.5 text-sm text-bark/80">{renderPreview(body)}</p>
      </div>
    </div>
  );
}

function AndroidPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-72">
      <div className="rounded-lg border border-frost bg-white p-4 shadow-md">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rally-500">
            <span className="text-[9px] font-bold text-white">R</span>
          </div>
          <span className="text-xs text-stone">Rally</span>
          <span className="ml-auto text-[10px] text-stone">Just now</span>
        </div>
        <p className="text-sm font-medium text-bark">{renderPreview(title)}</p>
        <p className="mt-1 text-sm text-bark/70">{renderPreview(body)}</p>
      </div>
    </div>
  );
}

function SMSPreview({ body }: { body: string }) {
  const rendered = renderPreview(body);
  const segments = Math.ceil(rendered.length / 160);

  return (
    <div className="mx-auto w-72">
      <div className="rounded-2xl rounded-bl-sm bg-rally-500 px-4 py-3 text-sm text-white shadow-md">
        {rendered}
      </div>
      <p className="mt-2 text-center text-xs text-stone">
        {rendered.length} chars &middot; {segments} segment{segments !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ---- Main Component ----

export function NotificationDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();

  // ---- Data fetching ----

  const {
    data: template,
    loading: templateLoading,
    refresh: refreshTemplate,
  } = useAdminData(
    () => fetchNotificationTemplate(templateId!),
    [templateId]
  );

  const {
    data: versions,
    loading: versionsLoading,
    refresh: refreshVersions,
  } = useAdminData(
    () => fetchTemplateVersions(templateId!),
    [templateId]
  );

  // ---- Local edit state ----

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('ios');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState<number | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Sync form when template loads
  const tpl = template as Template | null;
  if (tpl && !initialized) {
    setTitle(tpl.title);
    setBody(tpl.body);
    setIsActive(tpl.is_active);
    setInitialized(true);
  }

  // ---- Handlers ----

  async function handleSaveDraft() {
    if (!admin || !tpl) return;
    setSaving(true);
    try {
      await updateNotificationTemplate(
        tpl.id,
        title,
        body,
        isActive,
        'draft',
        admin.id,
        changeNote.trim() || undefined
      );
      setChangeNote('');
      setInitialized(false);
      refreshTemplate();
      refreshVersions();
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!admin || !tpl) return;
    setSaving(true);
    try {
      await updateNotificationTemplate(
        tpl.id,
        title,
        body,
        isActive,
        'published',
        admin.id,
        changeNote.trim() || 'Published'
      );
      setChangeNote('');
      setShowPublishModal(false);
      setInitialized(false);
      refreshTemplate();
      refreshVersions();
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert(targetVersion: number) {
    if (!admin || !tpl) return;
    setSaving(true);
    try {
      await revertNotificationTemplate(tpl.id, targetVersion, admin.id);
      setShowRevertModal(null);
      setInitialized(false);
      refreshTemplate();
      refreshVersions();
    } finally {
      setSaving(false);
    }
  }

  function copyVariable(varName: string) {
    navigator.clipboard.writeText(`{{${varName}}}`);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 1500);
  }

  // ---- Derived ----

  const titleOverLimit = title.length > 50;
  const bodyOverLimit = body.length > 160;
  const hasChannels = useMemo(() => {
    const ch = tpl?.channels ?? [];
    return { push: ch.includes('push'), sms: ch.includes('sms') };
  }, [tpl]);

  // ---- Render ----

  if (templateLoading) {
    return <p className="text-sm text-stone">Loading...</p>;
  }

  if (!tpl) {
    return (
      <div>
        <button
          onClick={() => navigate('/admin/notifications')}
          className="mb-4 flex items-center gap-1 text-sm text-rally-500 hover:text-rally-600"
        >
          <ArrowLeft size={16} /> Back to Message Library
        </button>
        <p className="text-sm text-stone">Template not found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Back + Header */}
      <button
        onClick={() => navigate('/admin/notifications')}
        className="mb-4 flex items-center gap-1 text-sm text-rally-500 hover:text-rally-600"
      >
        <ArrowLeft size={16} /> Back to Message Library
      </button>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-bark">{tpl.name || tpl.slug}</h1>
        <span className="font-mono text-xs text-stone">{tpl.slug}</span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Edit Form */}
        <div className="rounded-lg border border-frost bg-warm-white p-4">
          <h2 className="mb-4 text-lg font-semibold text-bark">Edit Template</h2>

          {/* Title */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-bark">Title</label>
              <span
                className={`text-xs ${titleOverLimit ? 'font-semibold text-red-600' : 'text-stone'}`}
              >
                {title.length}/50
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm text-bark focus:outline-none focus:ring-1 ${
                titleOverLimit
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                  : 'border-frost focus:border-rally-500 focus:ring-rally-500'
              }`}
            />
          </div>

          {/* Body */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-bark">Body</label>
              <span
                className={`text-xs ${bodyOverLimit ? 'font-semibold text-red-600' : 'text-stone'}`}
              >
                {body.length}/160
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className={`w-full rounded-md border px-3 py-2 text-sm text-bark focus:outline-none focus:ring-1 ${
                bodyOverLimit
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                  : 'border-frost focus:border-rally-500 focus:ring-rally-500'
              }`}
            />
          </div>

          {/* Active toggle */}
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                isActive ? 'bg-sage' : 'bg-stone/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-bark">{isActive ? 'Active' : 'Inactive'}</span>
          </div>

          {/* Variables */}
          {(tpl.variables ?? []).length > 0 && (
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-bark">
                Available Variables
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tpl.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => copyVariable(v)}
                    className="inline-flex items-center gap-1 rounded-md border border-frost bg-cream px-2 py-1 font-mono text-xs text-bark hover:bg-frost transition-colors"
                    title={`Copy {{${v}}} to clipboard`}
                  >
                    {`{{${v}}}`}
                    {copiedVar === v ? (
                      <Check size={12} className="text-sage" />
                    ) : (
                      <Copy size={12} className="text-stone" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Change Note */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-bark">
              Change Note <span className="font-normal text-stone">(optional)</span>
            </label>
            <input
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="What changed?"
              className="w-full rounded-md border border-frost px-3 py-2 text-sm text-bark focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="rounded-md border border-frost px-4 py-2 text-sm font-medium text-bark hover:bg-cream disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => setShowPublishModal(true)}
              disabled={saving}
              className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600 disabled:opacity-40"
            >
              Publish
            </button>
            <button
              disabled
              className="rounded-md border border-frost px-4 py-2 text-sm font-medium text-stone opacity-50 cursor-not-allowed"
              title="Coming soon"
            >
              Test Send
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="rounded-lg border border-frost bg-warm-white p-4">
          <h2 className="mb-4 text-lg font-semibold text-bark">Preview</h2>

          {/* Preview tabs */}
          <div className="mb-4 flex gap-1 rounded-lg bg-frost p-1 w-fit">
            {(
              [
                { key: 'ios' as const, label: 'iOS', show: hasChannels.push },
                { key: 'android' as const, label: 'Android', show: hasChannels.push },
                { key: 'sms' as const, label: 'SMS', show: hasChannels.sms },
              ] as const
            )
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPreviewTab(t.key)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    previewTab === t.key
                      ? 'bg-warm-white text-bark shadow-sm'
                      : 'text-stone hover:text-bark'
                  }`}
                >
                  {t.label}
                </button>
              ))}
          </div>

          {/* Preview content */}
          <div className="rounded-lg bg-cream/60 p-6">
            {previewTab === 'ios' && <IOSPreview title={title} body={body} />}
            {previewTab === 'android' && <AndroidPreview title={title} body={body} />}
            {previewTab === 'sms' && <SMSPreview body={body} />}
          </div>

          <p className="mt-3 text-xs text-stone">
            Variables shown with example values. Actual content will vary per recipient.
          </p>
        </div>
      </div>

      {/* Version History */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-bark">Version History</h2>

        {versionsLoading ? (
          <p className="text-sm text-stone">Loading versions...</p>
        ) : (versions as Version[] | null)?.length === 0 ? (
          <p className="text-sm text-stone">No version history yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-frost bg-warm-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-frost bg-cream">
                  <th className="px-4 py-3 font-medium text-stone">Version</th>
                  <th className="px-4 py-3 font-medium text-stone">Changed By</th>
                  <th className="px-4 py-3 font-medium text-stone">Changed At</th>
                  <th className="px-4 py-3 font-medium text-stone">Note</th>
                  <th className="px-4 py-3 font-medium text-stone">Title</th>
                  <th className="px-4 py-3 font-medium text-stone">Body</th>
                  <th className="px-4 py-3 font-medium text-stone" />
                </tr>
              </thead>
              <tbody>
                {((versions as Version[]) ?? []).map((v) => (
                  <tr key={v.version} className="border-b border-frost/50">
                    <td className="px-4 py-3 text-bark font-mono">v{v.version}</td>
                    <td className="px-4 py-3 text-bark">{v.changed_by_email || '—'}</td>
                    <td className="px-4 py-3 text-bark">
                      {new Date(v.changed_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-bark">{v.change_note || '—'}</td>
                    <td className="px-4 py-3 text-bark">
                      <span className="max-w-[10rem] truncate block">{v.title}</span>
                    </td>
                    <td className="px-4 py-3 text-bark">
                      <span className="max-w-[12rem] truncate block">{v.body}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setShowRevertModal(v.version)}
                        className="rounded-md border border-frost px-3 py-1 text-xs font-medium text-rally-500 hover:bg-rally-50"
                      >
                        Revert
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Publish confirmation modal */}
      {showPublishModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowPublishModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-warm-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold text-bark">Publish Template</h2>
            <p className="mb-6 text-sm text-stone">
              You are about to make this copy live for all users. Continue?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowPublishModal(false)}
                className="rounded-md border border-frost px-4 py-2 text-sm text-stone hover:bg-cream"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={saving}
                className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600 disabled:opacity-40"
              >
                {saving ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert confirmation modal */}
      {showRevertModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowRevertModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-warm-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold text-bark">Revert to Version {showRevertModal}</h2>
            <p className="mb-6 text-sm text-stone">
              This will replace the current title and body with version {showRevertModal}. A new
              version entry will be created. Continue?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRevertModal(null)}
                className="rounded-md border border-frost px-4 py-2 text-sm text-stone hover:bg-cream"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevert(showRevertModal)}
                disabled={saving}
                className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600 disabled:opacity-40"
              >
                {saving ? 'Reverting...' : 'Revert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
