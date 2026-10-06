import { test, expect } from '@playwright/test';
import { ready, openPlus, watchErrors, writesOn, aiOn, creds } from './helpers';

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
  // Month headings, or the empty state when this account has nothing upcoming.
  await expect(page.getByText(/^((JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)( \d{4})?|COMPLETED|No tournaments yet)$/).locator('visible=true').first()).toBeVisible();
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

// ── Guests are app-based (no SMS) ──
test('tournament Guests card: app followers + update box, no SMS', async ({ page }) => {
  const db = await parentDb();
  const { data: t } = await db.from('tournaments').select('id').order('start_date', { ascending: false }).limit(1).maybeSingle();
  test.skip(!t, 'No tournaments');
  await page.goto(`/tournament/${t.id}`);
  await expect(page.getByText('Guests & fans').first()).toBeVisible();
  await expect(page.getByLabel('Update for guests').first()).toBeVisible();
  await expect(page.getByText(/Send In-Person Details|Send Streaming Details/)).toHaveCount(0);
});

test('referral box copies an invite instead of texting', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/guests');
  await page.getByText('Copy invite to text').locator('visible=true').first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('RallyHUB');
  await expect(page.getByPlaceholder('Email or phone number')).toHaveCount(0);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('Google sign-in asks which account', async ({ page }) => {
    await page.goto('/auth');
    const req = page.waitForRequest((r) => r.url().includes('accounts.google.com'), { timeout: 20_000 });
    await page.getByText(/Continue with Google/i).locator('visible=true').first().click();
    expect(decodeURIComponent((await req).url())).toContain('prompt=select_account');
  });
});

test.describe('writes: games, lessons, seasons', () => {
  test.skip(!writesOn, 'Set QA_WRITES=1 to run tests that add and remove data');

  test('game detail, Directions only with an address, delete; swipe delete on Schedule', async ({ page }) => {
    const db = await parentDb();
    const { data: season } = await db.from('seasons').select('id').limit(1).single();
    const add = (o: Record<string, unknown>) => db.from('team_events').insert({ season_id: season.id, date: '2030-03-14', event_type: 'game', home_away: 'away', ...o }).select('id').single();
    const withAddr = (await add({ name: 'QA test', opponent: 'QA Westlake', venue_name: 'Westlake HS', address: '4100 Westbank Dr, Austin, TX 78746', time: '18:30' })).data!;
    const noAddr = (await add({ name: 'QA test', opponent: 'QA Bowie', venue_name: 'Main Gym', address: '' })).data!;
    try {
      await page.goto(`/game/${withAddr.id}`);
      await expect(page.getByText('@ QA Westlake').first()).toBeVisible();
      await expect(page.getByText('Directions', { exact: true }).locator('visible=true')).toHaveCount(1);
      await page.goto(`/game/${noAddr.id}`);
      await expect(page.getByText('Main Gym').first()).toBeVisible();
      await expect(page.getByText('Directions', { exact: true }).locator('visible=true')).toHaveCount(0);
      await page.getByLabel('Delete game').locator('visible=true').first().click();
      await page.getByLabel('Confirm delete').locator('visible=true').first().click();
      await expect.poll(async () => (await db.from('team_events').select('id').eq('id', noAddr.id)).data?.length).toBe(0);

      // Schedule: swipe left (scroll the row open), then tap Delete.
      await page.goto('/season');
      const row = page.locator('[aria-label^="@ QA Westlake"]').locator('visible=true').first();
      await row.waitFor();
      await row.evaluate((el) => { let n: HTMLElement | null = el as HTMLElement; while (n && !(n.scrollWidth > n.clientWidth + 40 && getComputedStyle(n).overflowX !== 'visible')) n = n.parentElement; if (n) n.scrollLeft = 88; });
      await page.getByLabel('Delete game').locator('visible=true').first().click();
      await expect.poll(async () => (await db.from('team_events').select('id').eq('id', withAddr.id)).data?.length).toBe(0);
    } finally {
      await db.from('team_events').delete().in('id', [withAddr.id, noAddr.id]);
    }
  });

  test('delete a season from the athlete page warns what goes with it', async ({ page }) => {
    const db = await parentDb();
    const { data: ath } = await db.from('athletes').select('id').limit(1).single();
    const s = (await db.from('seasons').insert({ athlete_id: ath.id, team_name: 'QA test season', season_year: '2030-2031' }).select('id').single()).data!;
    try {
      let msg = '';
      page.on('dialog', (d) => { msg = d.message(); d.accept(); });
      await page.goto(`/athlete/${ath.id}`);
      const name = page.getByText('QA test season').locator('visible=true').first();
      await name.waitFor();
      await name.locator('xpath=ancestor::div[@tabindex="0"][1]').locator('div[tabindex="0"]').first().click({ force: true });
      await expect.poll(async () => (await db.from('seasons').select('id').eq('id', s.id)).data?.length).toBe(0);
      expect(msg).toContain("can't be undone");
    } finally {
      await db.from('seasons').delete().eq('id', s.id);
    }
  });
});

async function parentDb() {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const c = creds('parent')!;
  await db.auth.signInWithPassword(c);
  return db as any;
}
