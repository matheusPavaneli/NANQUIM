import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI === undefined ? 'list' : 'github',
  use: {
    baseURL: 'http://localhost:4321',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node examples/vanilla-cdn/server.mjs',
    url: 'http://localhost:4321/',
    reuseExistingServer: true,
    env: { PAYS_AFTER_MS: '4000' },
  },
});
