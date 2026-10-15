import { mkdir, writeFile, rm } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { authDir, storagePath, sessionPath, origin } from './auth-paths.mjs'

// Never accept credentials from CLI arguments, environment variables or source files.
await mkdir(authDir, { recursive: true })
await Promise.all([storagePath, sessionPath].map(path => rm(path, { force: true })))
const browser = await chromium.launch({ headless: false })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${origin}/login`)
  console.log('Sign in as a Patient in the Chromium window. No credentials are recorded in logs. Waiting up to 5 minutes.')
  await page.getByRole('heading', { name: 'Patient Dashboard', exact: true }).waitFor({ timeout: 300_000 })
  // Reload forces the application to verify the session through the real /Auth/me.
  const verified = page.waitForResponse(r => new URL(r.url()).pathname.toLowerCase() === '/api/auth/me')
  await page.reload()
  const response = await verified
  if (response.status() !== 200 || (await response.json()).role !== 'Patient') {
    throw new Error('Patient session could not be verified')
  }
  await page.getByRole('heading', { name: 'Patient Dashboard', exact: true }).waitFor()
  const session = await page.evaluate(() => sessionStorage.getItem('his-auth-patient'))
  if (!session) throw new Error('Missing Patient session')
  await context.storageState({ path: storagePath })
  await writeFile(sessionPath, JSON.stringify({ origin, session }), { mode: 0o600 })
  console.log('Patient session verified. Private storageState and sessionStorage saved under .auth. Run npm run test:auth to verify reuse.')
} catch {
  await Promise.all([storagePath, sessionPath].map(path => rm(path, { force: true })))
  console.error('Login capture failed or timed out. No authentication state retained; retry npm run auth:manual.')
  process.exitCode = 1
} finally {
  await browser.close()
}
