import { expect, type Page } from '@playwright/test';

export type Role = 'parent' | 'coadmin' | 'athlete' | 'coach';

import fs from 'fs';

/** Signed in during setup? (false when the account is missing or its login failed) */
export const ready = (role: Role) => {
  try { return JSON.parse(fs.readFileSync(`e2e/.auth/${role}.json`, 'utf8')).origins?.length > 0; } catch { return false; }
};

export const creds = (role: Role) => {
  const k = role.toUpperCase();
  const email = process.env[`QA_${k}_EMAIL`];
  const password = process.env[`QA_${k}_PASSWORD`];
  return email && password ? { email, password } : null;
};

/** Writes are off unless QA_WRITES=1 (they create, then delete, "QA test" rows). */
export const writesOn = process.env.QA_WRITES === '1';
/** AI reads cost Claude API calls; off unless QA_AI=1. */
export const aiOn = process.env.QA_AI === '1';

export async function signIn(page: Page, role: Role) {
  const c = creds(role);
  if (!c) throw new Error(`Missing QA_${role.toUpperCase()}_EMAIL / _PASSWORD in .env.qa`);
  await page.goto('/auth');
  await page.getByPlaceholder('you@example.com').fill(c.email);
  await page.getByPlaceholder('••••••••').fill(c.password);
  await page.getByText('Sign In', { exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 25_000 });
}

/** The floating + (parent) or center tab + (coach). */
export const openPlus = (page: Page) => page.getByLabel('Add', { exact: true }).locator('visible=true').first().click();

/** Fail on uncaught page errors (e.g. "Promise constructor's argument is not a function"). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, `uncaught errors: ${errors.join(' | ')}`).toEqual([]);
}
