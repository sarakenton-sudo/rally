import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchEmailTemplates } from '@/lib/queries';
import { Mail } from 'lucide-react';

interface EmailTemplateRow {
  id: string;
  slug: string;
  name: string;
  subject: string;
  variables: string[];
  updated_at: string;
}

export function EmailTemplates() {
  const navigate = useNavigate();
  const { data, loading } = useAdminData(() => fetchEmailTemplates());

  const templates = (data as EmailTemplateRow[]) ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-bark">Email Templates</h1>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-stone">No email templates found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/admin/emails/${t.id}`)}
              className="group rounded-xl border border-frost bg-white p-5 text-left transition-all hover:border-rally-300 hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rally-50">
                  <Mail size={18} className="text-rally-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-bark truncate">{t.name}</h3>
                  <p className="text-xs text-stone truncate">{t.slug}</p>
                </div>
              </div>
              <p className="mb-3 text-sm text-bark/80 line-clamp-1">{t.subject}</p>
              <div className="flex flex-wrap gap-1.5">
                {t.variables.map((v: string) => (
                  <span
                    key={v}
                    className="rounded-md bg-frost/50 px-2 py-0.5 text-[11px] font-medium text-stone"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-stone/60">
                Updated {new Date(t.updated_at).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
