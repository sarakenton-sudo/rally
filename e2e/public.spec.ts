import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

// Signed-out checks: homepage, auth screen, public booking page, admin routes.

test('homepage loads with sign-up links (AD-03)', async ({ page, request }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('a[href="/auth?signup=true"]').first()).toBeVisible();
  await expect(page.locator('a[href="/auth?signup=true&role=coach"]').first()).toBeAttached();
  for (const path of ['/privacy', '/terms', '/about.html']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('early access is gone and redirects to sign-up (AD-03)', async ({ page }) => {
  await page.goto('/early-access');
  await expect(page).toHaveURL(/\/auth\?signup=true/);
});

test('coach sign-up link preselects Coach (A-08)', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/auth?signup=true&role=coach');
  await expect(page.getByText('Create Account', { exact: true })).toBeVisible();
  await expect(page.getByText('Coach', { exact: true })).toBeVisible();
  await expect(page.getByText('Parent / Guardian', { exact: true })).toBeVisible();
  done();
});

test('show password toggle (A-05)', async ({ page }) => {
  await page.goto('/auth');
  const pw = page.getByPlaceholder('••••••••');
  await pw.fill('secret123');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByText('Show password').click();
  await expect(pw).not.toHaveAttribute('type', 'password'); // RN Web drops type when shown
  await page.getByText('Hide password').click();
  await expect(pw).toHaveAttribute('type', 'password');
});

test('invite code field accepts any case and spaces (CO-02)', async ({ page }) => {
  await page.goto('/auth?signup=true');
  await page.getByText('Have an invite code?').click();
  const code = page.getByPlaceholder('e.g. a1b2c3d4e5f6');
  await code.pressSequentially('AB12 cd34');
  await expect(code).toHaveValue('ab12cd34');
});

test('wrong password shows an error, not a crash (A-01)', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/auth');
  await page.getByPlaceholder('you@example.com').fill('qa-nobody@rally-hub.com');
  await page.getByPlaceholder('••••••••').fill('definitely-wrong-1');
  await page.getByText('Sign In', { exact: true }).click();
  await expect(page.getByText(/invalid|incorrect|not found/i).first()).toBeVisible();
  await expect(page.getByText(/Supabase not configured/i)).toHaveCount(0);
  done();
});

test('signed-out app routes go to sign-in', async ({ page }) => {
  await page.goto('/hub');
  await expect(page).toHaveURL(/\/auth/);
});

test.describe('public booking page (B-01, B-05)', () => {
  const slug = process.env.QA_COACH_SLUG;

  test('published coach page loads signed out', async ({ page }) => {
    test.skip(!slug, 'Set QA_COACH_SLUG in .env.qa');
    const done = watchErrors(page);
    await page.goto(`/book/${slug}`);
    await expect(page.getByText('Booking page not found')).toHaveCount(0);
    await expect(page.getByText(/\$\d+/).first()).toBeVisible(); // lesson prices
    done();
  });

  test('embed mode renders', async ({ page }) => {
    test.skip(!slug, 'Set QA_COACH_SLUG in .env.qa');
    await page.goto(`/book/${slug}?embed=1&theme=dark&accent=3B82B0`);
    await expect(page.getByText('Booking page not found')).toHaveCount(0);
  });

  test('unknown page says not found', async ({ page }) => {
    await page.goto('/book/qa-no-such-coach-zz9');
    await expect(page.getByText('Booking page not found')).toBeVisible();
  });
});

test('admin deep links load, not 404 (AD-02)', async ({ request }) => {
  for (const path of ['/admin', '/admin/leads', '/admin/settings']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});
