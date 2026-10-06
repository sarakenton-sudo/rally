import { test, expect } from '@playwright/test';
import { ready, openPlus, watchErrors, writesOn, aiOn } from './helpers';

// Parent A on the website. Read-only unless QA_WRITES=1.
test.beforeEach(() => test.skip(!ready('parent'), 'Set QA_PARENT_EMAIL / QA_PARENT_PASSWORD in .env.qa'));

test('Home shows Next up, Needs you and Coming up (P-01, A-09)', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/(tabs)');
  await expect(page.getByText('Needs you').first()).toBeVisible();
  await expect(page.getByText('Coming up').first()).toBeVisible();
  await expect(page.getByLabel('Book a lesson').first()).toBeVisible();
  await expect(page.getByText(/Supabase not configured/i)).toHaveCount(0);
  done();
});

test('every tab opens without errors (P-20)', async ({ page }) => {
  const done = watchErrors(page);
  for (const [path, text] of [
    ['/season', /Tournaments|Season/], ['/travel', /Travel|Hotel/], ['/athlete', /Athlete/],
    ['/guests', /Guests|Invite/], ['/hub', /Settings|Account/], ['/family', /Co-parents & guests/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(text).locator('visible=true').first(), path).toBeVisible();
    await expect(page.getByText(/Unmatched Route|Something went wrong/i), path).toHaveCount(0);
  }
  done();
});

test('+ sheet shows every option in order (P-02)', async ({ page }) => {
  await page.goto('/(tabs)');
  await openPlus(page);
  for (const label of ['Paste anything', 'Add travel', 'Book a lesson', 'Save a login or code', 'Add a tournament or season', 'Add a team event', 'Add an athlete']) {
    await expect(page.getByLabel(label).first(), label).toBeVisible();
  }
  await page.getByLabel('Add a tournament or season').click();
  await expect(page.getByText('Paste a season schedule')).toBeVisible();
  for (const label of ['Invite a coach', 'View inbox', 'Copy plans@rally-hub.com']) {
    await expect(page.getByLabel(label).first(), label).toBeVisible();
  }
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
});

test('Home: 90 days by month, family logins', async ({ page }) => {
  await page.goto('/(tabs)');
  await expect(page.getByText('Next 90 days').first()).toBeVisible();
  await expect(page.getByText('Family logins', { exact: true }).first()).toBeVisible();
});

test('Schedule header: team details and share', async ({ page }) => {
  await page.goto('/season');
  const details = page.getByLabel('Team details').first();
  test.skip(!(await details.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)), 'No active team for this account');
  await expect(page.getByLabel('Share team details').first()).toBeVisible();
});

test('pushed screens have no extra "(tabs)" back bar', async ({ page }) => {
  await page.goto('/family');
  const athlete = page.getByText(/Profile, logins|·/).locator('visible=true').first();
  test.skip(!(await athlete.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)), 'No athletes');
  await athlete.click();
  await expect(page.getByText('(tabs)', { exact: true })).toHaveCount(0);
});

test('copy forwarding address (P-03)', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/(tabs)');
  await openPlus(page);
  await page.getByLabel('Copy plans@rally-hub.com').click();
  await expect(page.getByText(/Copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('plans@rally-hub.com');
});

test('Read it with unreadable text offers a manual choice (P-07)', async ({ page }) => {
  test.skip(!aiOn, 'Set QA_AI=1 to run tests that call the AI reader');
  await page.goto('/(tabs)');
  await openPlus(page);
  await page.getByLabel('Paste anything').fill('qa zebra kettle 47 lorem nonsense');
  await page.getByLabel('Read it').click();
  await expect(page.getByText(/Couldn.t tell what this is/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Travel').first()).toBeVisible();
});

test('Save a login or code opens the form (P-11)', async ({ page }) => {
  await page.goto('/(tabs)');
  await openPlus(page);
  await page.getByLabel('Save a login or code').click();
  await expect(page.getByText('Whose is it?')).toBeVisible();
});

test('tab bar is Home · Schedule · + · Travel · Family', async ({ page }) => {
  await page.goto('/(tabs)');
  for (const t of ['Home', 'Schedule', 'Travel', 'Family']) await expect(page.getByRole('tab', { name: t }).or(page.getByText(t, { exact: true })).first(), t).toBeVisible();
  await page.getByLabel('Settings').first().click();
  await expect(page).toHaveURL(/\/hub/);
});

test('Family tab: athletes, coaches, people, family logins', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/family');
  for (const t of ['Athletes', 'Coaches', 'Co-parents & guests', 'Family logins']) await expect(page.getByText(t, { exact: true }).first(), t).toBeVisible();
  await expect(page.getByLabel(/Invite (your|another) coach/).first()).toBeVisible();
  done();
});

test('Schedule: tournaments and games by month', async ({ page }) => {
  await page.goto('/season');
  await expect(page.getByText(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)( \d{4})?$/).first()).toBeVisible();
});

test('lessons entry points (L-03, L-04)', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/lessons');
  await expect(page.getByText('Have a coach link?')).toBeVisible();
  await expect(page.getByPlaceholder('rally-hub.com/book/… or code')).toBeVisible();
  await page.goto('/coaching');
  await expect(page.getByText('My Coaches')).toBeVisible();
  done();
});

test('connect with a bad coach code shows an error (L-01)', async ({ page }) => {
  await page.goto('/coaching');
  const input = page.getByPlaceholder('e.g. ABCD1234');
  test.skip(!(await input.isVisible()), 'Code box hidden for this account');
  await input.fill('ZZZZ0000');
  await page.getByText(/^Connect$|^Add$/).first().click();
  await expect(page.getByText(/not found|invalid|couldn.t|no coach/i).first()).toBeVisible();
});

test('connect via the booking-page link (L-02)', async ({ page }) => {
  const slug = process.env.QA_COACH_SLUG;
  test.skip(!slug, 'Set QA_COACH_SLUG');
  await page.goto('/lessons');
  await page.getByPlaceholder('rally-hub.com/book/… or code').fill(`rally-hub.com/book/${slug}`);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/open times|Book a Lesson|Connected/i).locator('visible=true').first()).toBeVisible();
});

test('payments settings page (L-12)', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/settings/payments');
  await expect(page.getByText('Payment method').first()).toBeVisible();
  await expect(page.getByText('Lesson payments').first()).toBeVisible();
  done();
});

test('co-parent invite screen (CO-01)', async ({ page }) => {
  await page.goto('/settings/invite-coparent');
  await expect(page.getByText('Invite Type')).toBeVisible();
  await expect(page.getByText('Permission')).toBeVisible();
});

test.describe('writes', () => {
  test.skip(!writesOn, 'Set QA_WRITES=1 to run tests that add and remove data');

  test('add then remove a forwarding address (P-18)', async ({ page }) => {
    const email = `qa+${Date.now()}@example.com`;
    page.on('dialog', (d) => d.accept());
    await page.goto('/settings/trusted-emails');
    await page.getByPlaceholder('e.g. sara@quietstandardco.com').fill(email);
    await page.getByText('Add Email Address').click();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/Adding…|Adding\.\.\./)).toHaveCount(0);
    // Remove: the row's trash button. Known web bug: Alert.alert is a no-op on web.
    await page.getByText(email).locator('xpath=ancestor::div[1]').getByRole('button').last().click();
    await expect(page.getByText(email), 'remove did nothing on web (Alert.alert no-op)').toHaveCount(0);
  });
});
