import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'

export const storagePath = path.resolve('.auth/patient.storage.json')
export const sessionPath = path.resolve('.auth/patient.session.json')
export const authFilesExist = () => existsSync(storagePath) && existsSync(sessionPath)

export const test = base.extend({
  context: async ({ browser }, provideContext) => {
    if (!authFilesExist()) throw new Error('Manual Patient login required: npm run auth:manual. Session verification is blocked.')
    let saved: { origin: string; session: string }
    try {
      saved = JSON.parse(readFileSync(sessionPath, 'utf8'))
      if (saved.origin !== 'http://localhost:5173' || typeof saved.session !== 'string') throw new Error()
    } catch { throw new Error('Invalid private session file. Repeat npm run auth:manual.') }
    const context = await browser.newContext({ storageState: storagePath })
    await context.addInitScript(({ origin, session }) => {
      if (location.origin === origin && !sessionStorage.getItem('his-auth-patient')) {
        sessionStorage.setItem('his-auth-patient', session)
      }
    }, saved)
    try { await provideContext(context) } finally {
      // Preserve rotated refresh tokens without printing or attaching the state.
      for (const page of context.pages()) {
        if (new URL(page.url()).origin !== saved.origin) continue
        const session = await page.evaluate(() => sessionStorage.getItem('his-auth-patient')).catch(() => null)
        if (session) {
          const { writeFileSync } = await import('node:fs')
          writeFileSync(sessionPath, JSON.stringify({ origin: saved.origin, session }), { mode: 0o600 })
          await context.storageState({ path: storagePath })
        }
        break
      }
      await context.close()
    }
  },
})

export { expect }
