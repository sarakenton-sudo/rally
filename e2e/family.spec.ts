import { test, expect, type Browser } from '@playwright/test';
import { ready } from './helpers';

// Co-parent B and athlete C see Parent A's family. Each signs in from saved state.
const ctx = (browser: Browser, role: string) => browser.newContext({ storageState: `e2e/.auth/${role}.json` });

test('co-parent lands on Home with shared data, no onboarding (CO-03)', async ({ browser }) => {
  test.skip(!ready('coadmin'), 'Set QA_COADMIN_EMAIL / _PASSWORD');
  const page = await (await ctx(browser, 'coadmin')).newPage();
  await page.goto('/(tabs)');
  await expect(page.getByText('Next 30 Days').first()).toBeVisible();
  await expect(page).not.toHaveURL(/onboarding/);
});

test('co-parent sees the same athletes as the parent (CO-04)', async ({ browser }) => {
  test.skip(!ready('coadmin') || !ready('parent'), 'Needs parent and co-admin accounts');
  const names = async (role: string) => {
    const page = await (await ctx(browser, role)).newPage();
    await page.goto('/athlete');
    await page.waitForLoadState('networkidle');
    return (await page.locator('body').innerText()).split('\n').filter((l) => /^[A-Z][a-z]+$/.test(l.trim())).sort();
  };
  const [a, b] = await Promise.all([names('parent'), names('coadmin')]);
  expect(b).toEqual(a);
});

test('athlete gets the athlete view, not parent setup (AT-02)', async ({ browser }) => {
  test.skip(!ready('athlete'), 'Set QA_ATHLETE_EMAIL / _PASSWORD');
  const page = await (await ctx(browser, 'athlete')).newPage();
  await page.goto('/(tabs)');
  await expect(page).not.toHaveURL(/onboarding|\/today/);
  await expect(page.getByText(/Supabase not configured/i)).toHaveCount(0);
});
