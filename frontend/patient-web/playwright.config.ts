import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    // Authenticated traces, videos and automatic screenshots may contain secrets/PII.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'session', testMatch: 'authenticated-session.spec.ts', outputDir: './test-results/session' },
  ],
  // Use the already running real portal and backend; never launch fixture scripts.
})
