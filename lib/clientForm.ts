// Pure helpers for the coach's Add / Edit client forms (no React Native).

/** Volleyball positions offered as chips; anything else goes in "Other". */
export const POSITIONS = ['OH', 'MB', 'OPP', 'S', 'L/DS'] as const;
export const POSITION_LABEL: Record<string, string> = {
  OH: 'Outside', MB: 'Middle', OPP: 'Opposite', S: 'Setter', 'L/DS': 'Libero / DS',
};

export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export interface NewClientInput {
  parentEmail: string;
  athleteFirst: string;
  athleteLast?: string;
  parentName?: string;
  parentPhone?: string;
  sport?: string;
  primary?: string;
  secondary?: string;
  gradYear?: string;
  club?: string;
  groupIds?: string[];
}

/** First problem with the form, or null when it can be saved. */
export function validateNewClient(v: Pick<NewClientInput, 'parentEmail' | 'athleteFirst' | 'gradYear'>, now = new Date()): string | null {
  if (!v.athleteFirst.trim()) return "Enter the athlete's first name.";
  if (!v.parentEmail.trim()) return "Enter the parent's email.";
  if (!isEmail(v.parentEmail)) return "That email doesn't look right.";
  if (v.gradYear?.trim()) {
    const y = Number(v.gradYear);
    const thisYear = now.getFullYear();
    if (!Number.isInteger(y) || y < thisYear - 1 || y > thisYear + 14) return 'Grad year should be a year like ' + (thisYear + 4) + '.';
  }
  return null;
}

/** Primary + secondary → athletes.positions (no blanks, no duplicate). */
export function positionsFrom(primary?: string, secondary?: string): string[] {
  const p = primary?.trim(), s = secondary?.trim();
  return [p, s && s !== p ? s : undefined].filter(Boolean) as string[];
}

/** "Signed by Jordan Carter · Oct 4" / "Signed (old version) …" / "Not signed". */
export function releaseLabel(r: { signer_name: string; accepted_at: string; outdated?: boolean } | null | undefined): { text: string; ok: boolean } {
  if (!r) return { text: 'Not signed', ok: false };
  const d = new Date(r.accepted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return r.outdated
    ? { text: `Signed an older version (${r.signer_name}, ${d}). Needs to re-sign.`, ok: false }
    : { text: `Signed by ${r.signer_name} · ${d}`, ok: true };
}
