import { test, expect, type Browser } from '@playwright/test';
import { ready } from './helpers';

// Co-parent B and athlete C see Parent A's family. Each signs in from saved state.
const ctx = (browser: Browser, role: string) => browser.newContext({ storageState: `e2e/.auth/${role}.json` });

test('co-parent lands on Home with shared data, no onboarding (CO-03)', async ({ browser }) => {
  test.skip(!ready('coadmin'), 'Set QA_COADMIN_EMAIL / _PASSWORD');
  const page = await (await ctx(browser, 'coadmin')).newPage();
  await page.goto('/(tabs)');
  await expect(page.getByText('Coming up').first()).toBeVisible();
  await expect(page).not.toHaveURL(/onboarding/);
});

test('co-parent sees the family on the Family tab (CO-04; data check is in backend-smoke)', async ({ browser }) => {
  test.skip(!ready('coadmin'), 'Needs a co-admin account');
  const page = await (await ctx(browser, 'coadmin')).newPage();
  await page.goto('/family');
  await expect(page.getByText('Athletes', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Profile, logins|·/).locator('visible=true').first()).toBeVisible(); // at least one athlete row
});

test('athlete gets the athlete view, not parent setup (AT-02)', async ({ browser }) => {
  test.skip(!ready('athlete'), 'Set QA_ATHLETE_EMAIL / _PASSWORD');
  const page = await (await ctx(browser, 'athlete')).newPage();
  await page.goto('/(tabs)');
  await expect(page).not.toHaveURL(/onboarding|\/today/);
  await expect(page.getByText(/Supabase not configured/i)).toHaveCount(0);
});
