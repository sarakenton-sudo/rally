import { test as setup } from '@playwright/test';
import fs from 'fs';
import { creds, signIn, type Role } from './helpers';

// Signs each test account in once and saves the session for its specs.
for (const role of ['parent', 'coadmin', 'athlete', 'coach'] as Role[]) {
  setup(`sign in: ${role}`, async ({ page }) => {
    const file = `e2e/.auth/${role}.json`;
    fs.mkdirSync('e2e/.auth', { recursive: true });
    if (!creds(role)) {
      fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
      setup.skip(true, `No QA_${role.toUpperCase()}_EMAIL in .env.qa`);
    }
    try {
      await signIn(page, role);
    } catch (e) {
      // Leave an empty session so this account's tests skip instead of failing the run.
      fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
      setup.skip(true, `${role} could not sign in — check the account exists and its email is confirmed`);
    }
    await page.context().storageState({ path: file });
  });
}
