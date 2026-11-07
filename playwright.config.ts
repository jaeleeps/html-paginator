import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser checks (layout, print, PDF). Run with `npm run test:e2e`,
 * which builds dist first — fixtures load the built bundles.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { ...devices['Desktop Chrome'], headless: true },
  projects: [{ name: 'chromium' }],
});
