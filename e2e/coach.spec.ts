import { test, expect } from '@playwright/test';
import { ready, openPlus, watchErrors } from './helpers';

// Coach D on the website. Read-only.
test.beforeEach(() => test.skip(!ready('coach'), 'Set QA_COACH_EMAIL / QA_COACH_PASSWORD in .env.qa'));

test('coach lands on Today with the money strip (C-01)', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/today');
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByLabel("This week's money")).toBeVisible();
  for (const t of ['Schedule', 'Clients', 'Business']) await expect(page.getByText(t, { exact: true }).last()).toBeVisible();
  done();
});

test('coach-only login has no Family switch (C-01)', async ({ page }) => {
  test.skip(process.env.QA_COACH_IS_PARENT === '1', 'This coach is also a parent');
  await page.goto('/today');
  await expect(page.getByLabel("This week's money")).toBeVisible();
  await expect(page.getByLabel('Switch to Family')).toHaveCount(0);
});

test('coach + sheet top tier (C-16)', async ({ page }) => {
  await page.goto('/today');
  await openPlus(page);
  for (const t of ['Add a client', 'Invite a client', 'Add open time', 'Book a lesson', 'Record a payment', 'Share my booking link']) {
    await expect(page.getByText(t, { exact: true }).locator('visible=true').first(), t).toBeVisible();
  }
  await expect(page.getByText('Announce open times')).toBeVisible();
});

test('every coach screen opens (C-02…C-27)', async ({ page }) => {
  const done = watchErrors(page);
  const screens: [string, RegExp | string][] = [
    ['/coach-schedule', 'Schedule'], ['/coach-clients', 'Clients'], ['/business', 'Your business'],
    ['/coach/booking-page', 'Booking Page'], ['/coach/policies', 'Terms & Release'], ['/coach/payments', 'Earnings'],
    ['/coach/unpaid', /Record a payment|All paid up/], ['/coach/book-family', 'Book a lesson'],
    ['/coach/announce', /Announce open times/], ['/coach/facilities', /Facilit/], ['/coach/session-types', /Session Types|session types/],
    ['/coach/availability', /Availability|Open/], ['/coach/requests', /Request/],
  ];
  for (const [path, text] of screens) {
    await page.goto(path);
    await expect(page.getByText(text).locator('visible=true').first(), path).toBeVisible();
    await expect(page.getByText(/Unmatched Route|Something went wrong/i), path).toHaveCount(0);
  }
  done();
});

test('schedule offers the Google Calendar feed (C-24)', async ({ page }) => {
  await page.goto('/coach-schedule');
  await expect(page.getByText(/Add to Google Calendar|Sync to your calendar/).first()).toBeVisible();
});

test('payment settings show both choices (C-26)', async ({ page }) => {
  await page.goto('/coach/payments');
  await expect(page.getByText('When families are charged')).toBeVisible();
  await expect(page.getByText('Card processing fees')).toBeVisible();
});

test('announce shows the daily limit (C-22)', async ({ page }) => {
  await page.goto('/coach/announce');
  await expect(page.getByText(/of 3 announcements left today|No open times to announce|sent 3 announcements/)).toBeVisible();
});

test('session type dropdowns open inline (no pop-up over the form)', async ({ page }) => {
  await page.goto('/coach/session-type-edit');
  await page.getByLabel(/^Booking:/).first().click();
  await expect(page.getByText('Instant book').first()).toBeVisible();
  await page.getByText('Instant book').first().click();
  await expect(page.getByText('Bookings are confirmed right away, with no approval step.')).toBeVisible();
  await expect(page.getByText(/charged/i)).toHaveCount(0);
});

test('setup checklist includes where you coach', async ({ page }) => {
  await page.goto('/today');
  const card = page.getByText('Get set up').first();
  test.skip(!(await card.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)), 'Setup already complete for this coach');
  await expect(page.getByText('Where you coach (gym or facility)').first()).toBeVisible();
});

test('Schedule loads when opened directly (refresh or link), not empty', async ({ page }) => {
  await page.goto('/coach-schedule');
  await expect(page.getByLabel('Next week').first()).toBeVisible();
  // The week loads for the coach (not stuck on "0 lessons" with nothing scheduled forever).
  await expect.poll(async () => (await page.locator('body').innerText()).match(/\d{1,2}:\d\d [AP]M – /) !== null || (await page.getByText('Nothing scheduled').count()) < 7, { timeout: 15_000 }).toBe(true);
});
