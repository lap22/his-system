const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { chromium } = require('playwright')

const port = 5184
const baseUrl = `http://127.0.0.1:${port}`
const userId = '11111111-1111-4111-8111-111111111111'
const doctorId = '22222222-2222-4222-8222-222222222222'
const appointmentId = '33333333-3333-4333-8333-333333333333'
const profileId = '44444444-4444-4444-8444-444444444444'
const departmentId = '55555555-5555-4555-8555-555555555555'

const session = role => ({ accessToken: 'synthetic-browser-token', refreshToken: 'synthetic-browser-refresh',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z', userId, email: `${role.toLowerCase()}@example.invalid`, role })
const doctor = { id: doctorId, userId, fullName: 'Dr. Trần Minh Long With A Responsive Name', departmentId,
  departmentName: 'Internal Medicine', specialization: 'General medicine', isActive: true }
const appointment = { id: appointmentId, patientProfileId: profileId, patientName: 'Nguyễn Minh An', doctorId,
  doctorName: doctor.fullName, departmentId, departmentName: doctor.departmentName, appointmentDate: '2026-10-29',
  startTime: '09:00:00', endTime: '09:30:00', symptoms: 'Synthetic browser-only symptoms', status: 'Pending',
  createdAt: '2026-10-20T01:00:00Z', updatedAt: null, cancelledAt: null, cancellationReason: null }

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(baseUrl)).ok) return } catch { /* Vite is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Isolated mocked-browser Vite server did not become ready.')
}

async function installMocks(page, role = 'Doctor') {
  const requests = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    assert.equal(request.method(), 'GET', `Mocked browser test attempted mutation: ${request.method()} ${url.pathname}`)
    const body = url.pathname.toLowerCase() === '/api/auth/me' ? { userId, email: `${role.toLowerCase()}@example.invalid`, role }
      : url.pathname.toLowerCase() === '/api/doctors' ? [doctor]
        : url.pathname.toLowerCase() === `/api/appointments/${appointmentId}` ? appointment
          : url.pathname.toLowerCase() === '/api/appointments' ? [appointment]
            : null
    assert.notEqual(body, null, `Unexpected API request: ${url.pathname}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/hubs/queue/**', route => route.abort('blockedbyclient'))
  return requests
}

async function run() {
  const vitePackage = require.resolve('vite/package.json', { paths: [path.resolve(__dirname, '..')] })
  const viteCli = path.join(path.dirname(vitePackage), 'bin', 'vite.js')
  const server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let serverErrors = ''
  server.stderr.on('data', chunk => { serverErrors += String(chunk) })
  let browser
  try {
    await waitForServer()
    browser = await chromium.launch({ headless: true })

    const anonymous = await browser.newContext()
    const anonymousPage = await anonymous.newPage()
    await installMocks(anonymousPage)
    await anonymousPage.goto(`${baseUrl}/doctor/appointments/${appointmentId}`)
    await anonymousPage.getByRole('button', { name: 'Sign in' }).waitFor()
    assert.match(anonymousPage.url(), /\/login$/)
    await anonymous.close()

    const admin = await browser.newContext()
    await admin.addInitScript(value => sessionStorage.setItem('his-auth-staff', JSON.stringify(value)), session('Admin'))
    const adminPage = await admin.newPage()
    await installMocks(adminPage, 'Admin')
    await adminPage.goto(`${baseUrl}/doctor/dashboard`)
    await adminPage.getByText('Doctor access is required for this page.').waitFor()
    await admin.close()

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await mobile.addInitScript(value => sessionStorage.setItem('his-auth-staff', JSON.stringify(value)), session('Doctor'))
    const page = await mobile.newPage()
    const requests = await installMocks(page)
    await page.goto(`${baseUrl}/doctor/dashboard`)
    await page.getByRole('heading', { name: 'Doctor Dashboard' }).waitFor()
    await page.getByRole('button', { name: 'Open Doctor navigation' }).click()
    const navigation = page.getByRole('navigation', { name: 'Doctor navigation' }).last()
    await navigation.waitFor()
    await page.keyboard.press('Escape')
    await navigation.waitFor({ state: 'hidden' })

    await page.goto(`${baseUrl}/doctor/appointments/${appointmentId}`)
    const trigger = page.getByRole('button', { name: 'Confirm appointment', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Confirm this appointment?' })
    await dialog.waitFor()
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'dialog must trap initial focus')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'focus must return to the confirmation trigger')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true,
      'mobile layout must not overflow horizontally')
    assert.equal(requests.some(value => !value.startsWith('GET ')), false)
    await mobile.close()
  } finally {
    if (browser) await browser.close()
    server.kill()
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 3000) } })
  }
  if (serverErrors && !/ExperimentalWarning/.test(serverErrors)) process.stderr.write(serverErrors)
  console.log('Mocked browser acceptance: 3/3 PASS (anonymous guard, Admin denial, Doctor mobile/dialog focus).')
}

run().catch(error => { console.error(error instanceof Error ? error.message : 'Mocked browser acceptance failed.'); process.exitCode = 1 })
