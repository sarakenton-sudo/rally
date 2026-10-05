import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import { config as load } from 'dotenv';

// Test accounts live in .env.qa (gitignored). See .env.qa.example.
load({ path: '.env.qa' });

const baseURL = process.env.QA_BASE_URL || 'https://rally-hub.com';
const role = (name: string) => ({ storageState: `e2e/.auth/${name}.json` });

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'public', testMatch: /public\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'public-iphone', testMatch: /public\.spec\.ts/, use: { ...devices['iPhone 15'] } },
    { name: 'parent', testMatch: /parent\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'], ...role('parent') } },
    { name: 'coach', testMatch: /coach\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'], ...role('coach') } },
    { name: 'family', testMatch: /family\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'] } },
    // Sign-out runs last: it ends the parent session the other specs share.
    { name: 'signout', testMatch: /signout\.spec\.ts/, dependencies: ['parent', 'family'], use: { ...devices['Desktop Chrome'], ...role('parent') } },
  ],
});
