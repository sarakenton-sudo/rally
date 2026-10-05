// Admin-editable notification wording (notification_templates, 00033 + 00084).
// Edge functions call renderNotification(db, slug, vars, fallback): the admin's
// published template wins; if it's missing the hard-coded fallback is used; if
// the admin switched it off (is_active=false) nothing is sent on any channel.
// Pure parts (applyTemplate, fillTemplate) have no Deno imports so jest can
// test them directly (lib/__tests__/templates.test.ts).

export type Channel = 'push' | 'email' | 'sms';

export interface TemplateRow {
  title_template: string;
  body_template: string;
  channels: string[] | null;
  is_active: boolean | null;
}

export interface Fallback {
  title: string;
  body: string;
  channels: Channel[];
}

export interface Rendered {
  title: string;
  body: string;
  push: boolean;
  email: boolean;
  /** 'template' = admin copy used; 'fallback' = built-in copy; 'off' = admin disabled it. */
  source: 'template' | 'fallback' | 'off';
}

export type Vars = Record<string, string | number | null | undefined>;

/** Replace {{name}} with vars.name ('' when missing); trims stray separators left by empty vars. */
export function fillTemplate(tpl: string, vars: Vars): string {
  return tpl
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
      const v = vars[k];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

export function applyTemplate(row: TemplateRow | null, vars: Vars, fallback: Fallback): Rendered {
  if (!row) {
    return {
      title: fallback.title, body: fallback.body,
      push: fallback.channels.includes('push'), email: fallback.channels.includes('email'), source: 'fallback',
    };
  }
  if (row.is_active === false) return { title: '', body: '', push: false, email: false, source: 'off' };
  const channels = (row.channels ?? fallback.channels) as string[];
  const title = fillTemplate(row.title_template, vars) || fallback.title;
  const body = fillTemplate(row.body_template, vars) || fallback.body;
  return { title, body, push: channels.includes('push'), email: channels.includes('email'), source: 'template' };
}

// ---- Loading (edge functions only) ----

const TTL_MS = 60_000;
const cache = new Map<string, { row: TemplateRow | null; at: number }>();

/** Minimal shape of the supabase-js client we use (keeps this file Deno/jest neutral). */
interface Db {
  from: (t: string) => any;
}

export async function loadTemplate(db: Db, slug: string): Promise<TemplateRow | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;
  let row: TemplateRow | null = null;
  try {
    const { data } = await db.from('notification_templates')
      .select('title_template, body_template, channels, is_active')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    row = (data as TemplateRow | null) ?? null;
  } catch (e) {
    console.error('[templates] load', slug, e);
    row = null; // fall back to built-in copy
  }
  cache.set(slug, { row, at: Date.now() });
  return row;
}

export async function renderNotification(db: Db, slug: string, vars: Vars, fallback: Fallback): Promise<Rendered> {
  return applyTemplate(await loadTemplate(db, slug), vars, fallback);
}

// ---- Shared senders ----

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Simple branded email body: the message, an optional button, then a link to the app. */
export function emailHtml(body: string, button?: { label: string; url: string }, footer?: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#1E3A5F">` +
    `<p style="font-size:16px;line-height:1.5">${esc(body).replace(/\n/g, '<br>')}</p>` +
    (button
      ? `<p><a href="${button.url}" style="display:inline-block;background:#3B82B0;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(button.label)}</a></p>`
      : `<p>Open <a href="https://rally-hub.com/app" style="color:#3B82B0">RallyHUB</a> for details.</p>`) +
    (footer ? `<p style="font-size:12px;color:#8FA8BF">${footer}</p>` : '') +
    `</div>`;
}

/**
 * Send one email through SendGrid. Returns true on success, or a short reason
 * (status + SendGrid's message) so callers can surface why email failed.
 */
export async function sendEmail(apiKey: string, to: string, subject: string, html: string, fromName = 'RallyHUB'): Promise<true | string> {
  if (!apiKey) return 'no key';
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'hello@rally-hub.com', name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  }).catch((e) => { console.error('[templates] sendgrid', e); return null; });
  if (!res) return 'network error';
  if (res.ok) return true;
  const detail = await res.text().catch(() => '');
  console.error('[templates] sendgrid', res.status, detail);
  try { return `${res.status}: ${JSON.parse(detail).errors?.[0]?.message ?? ''}`; } catch { return String(res.status); }
}
