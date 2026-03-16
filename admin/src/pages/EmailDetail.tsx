import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminData } from '@/hooks/useAdminData';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { fetchEmailTemplate, updateEmailTemplate } from '@/lib/queries';
import { ArrowLeft, Save, Eye, Code, RotateCcw } from 'lucide-react';

export function EmailDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const { data, loading } = useAdminData(
    () => fetchEmailTemplate(templateId!),
    [templateId]
  );

  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (data) {
      setSubject(data.subject ?? '');
      setHtmlBody(data.html_body ?? '');
    }
  }, [data]);

  // Update iframe preview
  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        // Replace variables with example values for preview
        let preview = htmlBody;
        const examples: Record<string, string> = {
          referrer_name: 'Sarah K.',
          invite_code: 'RALLY-2X9K',
        };
        for (const [key, val] of Object.entries(examples)) {
          preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
        }
        doc.open();
        doc.write(preview);
        doc.close();
      }
    }
  }, [htmlBody, tab]);

  const handleSave = async () => {
    if (!templateId || !admin) return;
    setSaving(true);
    try {
      await updateEmailTemplate(templateId, subject, htmlBody, admin.id);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (data) {
      setSubject(data.subject ?? '');
      setHtmlBody(data.html_body ?? '');
      setDirty(false);
    }
  };

  if (loading) return <p className="text-sm text-stone">Loading...</p>;
  if (!data) return <p className="text-sm text-red-500">Template not found.</p>;

  const variables: string[] = data.variables ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/emails')}
            className="rounded-lg p-1.5 text-stone hover:bg-frost/50 hover:text-bark"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-bark">{data.name}</h1>
            <p className="text-xs text-stone">{data.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-frost px-3 py-1.5 text-sm text-stone hover:bg-frost/30"
            >
              <RotateCcw size={14} />
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              dirty
                ? 'bg-rally-600 text-white hover:bg-rally-700'
                : 'bg-frost/50 text-stone cursor-not-allowed'
            }`}
          >
            <Save size={14} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone">
          Subject Line
        </label>
        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
          className="w-full rounded-lg border border-frost bg-white px-3 py-2 text-sm text-bark focus:border-rally-400 focus:outline-none focus:ring-1 focus:ring-rally-400"
        />
      </div>

      {/* Variables */}
      {variables.length > 0 && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone">
            Available Variables
          </label>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v: string) => (
              <button
                key={v}
                onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
                className="rounded-md border border-rally-200 bg-rally-50 px-2.5 py-1 text-xs font-medium text-rally-700 transition-colors hover:bg-rally-100"
                title="Click to copy"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="mb-3 flex gap-1 rounded-lg bg-frost/30 p-1 self-start">
        <button
          onClick={() => setTab('edit')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'edit' ? 'bg-white text-bark shadow-sm' : 'text-stone hover:text-bark'
          }`}
        >
          <Code size={13} />
          HTML
        </button>
        <button
          onClick={() => setTab('preview')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'preview' ? 'bg-white text-bark shadow-sm' : 'text-stone hover:text-bark'
          }`}
        >
          <Eye size={13} />
          Preview
        </button>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 min-h-0">
        {tab === 'edit' ? (
          <textarea
            value={htmlBody}
            onChange={(e) => {
              setHtmlBody(e.target.value);
              setDirty(true);
            }}
            className="h-full w-full resize-none rounded-lg border border-frost bg-white p-4 font-mono text-xs text-bark leading-relaxed focus:border-rally-400 focus:outline-none focus:ring-1 focus:ring-rally-400"
            style={{ minHeight: '400px' }}
            spellCheck={false}
          />
        ) : (
          <div className="h-full rounded-lg border border-frost bg-white overflow-hidden" style={{ minHeight: '400px' }}>
            <iframe
              ref={iframeRef}
              title="Email Preview"
              className="h-full w-full border-0"
              style={{ minHeight: '400px' }}
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  );
}
