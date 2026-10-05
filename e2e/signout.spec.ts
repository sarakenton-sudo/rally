import { test, expect } from '@playwright/test';
import { ready } from './helpers';

test('sign out returns to a full-screen login and stays signed out (A-06)', async ({ page }) => {
  test.skip(!ready('parent'), 'Set QA_PARENT_EMAIL');
  page.on('dialog', (d) => d.accept());
  await page.goto('/settings/account');
  await page.getByText('Sign Out', { exact: true }).click();
  await expect(page).toHaveURL(/\/auth/);
  await page.goto('/hub');
  await expect(page).toHaveURL(/\/auth/);
});
