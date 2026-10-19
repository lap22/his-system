import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'

if (!process.argv.includes('--execute') || process.env.HIS_BROWSER_ACCEPTANCE !== 'APPROVED-FE-5.2.2') throw Error('Explicit controlled execution opt-in required')
const origin = 'http://localhost:5173'
const ids = {
  department: 'a64f9cba-4ad9-4a39-9b17-475b19e29dce', patient: '8fcd366b-ee9c-495f-982a-3bd201765b66',
  doctor: '913c4d31-9b54-4194-95bd-80b2c09990b6', self: '1ca14418-e078-487f-9b45-7c291c41fe16',
  appointments: ['fb7b1e7e-cc37-47ac-ade2-5053a768a1de', 'dd54002e-2436-400b-ad32-cdd3dadebb52',
    '1bcbad9c-45ee-45fa-bfa2-738cb0244ebe', '0a07acf8-356b-4b49-9bb3-71db4587381c',
    'c9e6fd79-7a30-4715-a35d-16b072984516', '7bd54f06-cd84-4c7e-b27c-1073c8d04284',
    '39258aac-45ac-49f3-9278-28bc24c396e5', '2e5bb893-3075-4e10-92dc-f9e7b05229d2'],
}
const [A, B, C] = ids.appointments
const markerKey = 'his-booking-attempt-' + ids.patient
const cancellationKey = 'his-cancellation-' + ids.patient + '-'
const prefix = 'QA522-a64f9cba'
const results = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, 'NOT TESTED']))
const counts = { login: 0, patch: 0, get: 0, blocked: 0, patchById: {}, backendPatchStatuses: [], responses: {} }
const violations = []
const pendingRoutes = new Set()
function require(value, message) { if (!value) throw Error(message) }
function passed(index, name) { results[index] = 'PASS'; console.log(`PASS ${index}: ${name}`) }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
async function bounded(promise, label) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), 20000) })]) }
  finally { clearTimeout(timer) }
}
const aEntered = deferred(), aRelease = deferred(), cCommitted = deferred()
const helper = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tests/sql/qa522-cancellation-fixtures.ps1'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
const waiting = []
createInterface({ input: helper.stdout }).on('line', line => {
  const pending = waiting.shift()
  if (!pending) { violations.push('Unexpected fixture-helper output'); return }
  try { const value = JSON.parse(line); if (!value.ok) pending.reject(Error('Fixture guard: ' + value.safeMessage)); else pending.resolve(value.data) }
  catch { pending.reject(Error('Invalid fixture-helper protocol; output redacted')) }
})
helper.stderr.on('data', () => violations.push('Fixture helper wrote stderr; content withheld'))
helper.on('exit', () => { for (const pending of waiting.splice(0)) pending.reject(Error('Fixture helper exited')) })
function sql(op, data = {}) {
  return new Promise((resolve, reject) => { waiting.push({ resolve, reject }); helper.stdin.write(JSON.stringify({ op, ...data }) + '\n') })
}
let browser, context, setup = false, cleanup, error
let captureToken
try {
  const preflight = await sql('preflight')
  console.log('READ-ONLY GUARDS PASS: ' + preflight.baseline.digest)
  const password = randomBytes(32).toString('base64')
  const inserted = await sql('setup', { password }); setup = true
  require(inserted.inserted === 15, 'Fixture count mismatch')
  console.log('SQL SETUP: 15 exact approved fixture rows')
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC', serviceWorkers: 'block' })
  const page = await context.newPage()
  page.on('pageerror', () => violations.push('Uncaught browser page error'))
  page.on('response', response => {
    const path = new URL(response.url()).pathname.toLowerCase()
    if (!path.startsWith('/api/')) return
    const key = response.request().method() + ' ' + response.status()
    counts.responses[key] = (counts.responses[key] ?? 0) + 1
  })
  await context.route('**/api/**', route => {
    const task = handle(route).catch(async () => { violations.push('API routing/guard error'); await route.abort().catch(() => {}) }).finally(() => pendingRoutes.delete(task))
    pendingRoutes.add(task)
    return task
  })
  async function handle(route) {
    const request = route.request(), method = request.method(), path = new URL(request.url()).pathname.toLowerCase()
    const knownId = ids.appointments.find(id => path === `/api/appointments/${id}`)
    if (method === 'GET') {
      const allowed = ['/api/auth/me', '/api/appointments/my', '/api/patient-profiles', '/api/departments', '/api/doctors'].includes(path)
        || knownId || path === `/api/doctors/${ids.doctor}` || path === `/api/doctors/${ids.doctor}/available-slots`
      if (!allowed || ++counts.get > 150) return block(route, 'GET allowlist/budget')
      return route.continue()
    }
    if (method === 'POST' && path === '/api/auth/login' && ++counts.login === 1) return route.continue()
    const id = [A, B, C].find(id => path === `/api/appointments/${id}/cancel`)
    if (method !== 'PATCH' || !id || (counts.patchById[id] ?? 0) >= 1 || counts.patch >= 3) return block(route, 'Unapproved or duplicate mutation')
    counts.patchById[id] = 1; counts.patch++
    const payload = request.postDataJSON()
    const expectedReason = id === A ? 'QA522 cancellation reason' : id === B ? null : 'QA522 uncertain outcome'
    require(payload.reason === expectedReason, 'Cancellation payload reason mismatch')
    if (id === A) { aEntered.resolve(); await aRelease.promise }
    const response = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 15000 })
    counts.backendPatchStatuses.push(response.status())
    require(response.status() === 200, 'Real cancellation backend rejected request')
    const body = await response.json()
    require(body.id === id && body.status === 'Cancelled' && body.cancellationReason === expectedReason, 'Real cancellation response contract mismatch')
    const adopted = await sql('adopt', { id })
    require(adopted.status === 'Cancelled', 'SQL did not verify committed cancellation')
    if (id === C) { cCommitted.resolve(); return route.abort('connectionreset') }
    return route.fulfill({ response }) // Unchanged real backend response; no fabricated status/body.
  }
  async function block(route, message) { counts.blocked++; violations.push(message); return route.abort() }
  await page.goto(origin + '/login')
  await page.getByLabel('Email address', { exact: true }).fill('qa522-patient-a64f9cba@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill(password)
  const loggedIn = page.waitForResponse(response => new URL(response.url()).pathname.toLowerCase() === '/api/auth/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  require((await loggedIn).status() === 200, 'Synthetic login failed')
  captureToken = await sql('token'); require(captureToken.count === 1, 'Expected one synthetic token')
  console.log('LOGIN PASS; captured RefreshToken ID ' + captureToken.tokenId)
  await expect(page.getByRole('heading', { name: 'Patient Dashboard', exact: true })).toBeVisible()
  async function details(id) {
    await page.goto(origin + '/appointments/' + id)
    await expect(page.getByRole('heading', { name: 'Appointment details', exact: true })).toBeVisible()
    await expect(page.getByText('Appointment reference', { exact: true })).toBeVisible()
    await expect(page.getByText(id, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh appointment', exact: true })).toBeEnabled()
    await expect(page.getByText('22 Oct 2026', { exact: true })).toBeVisible()
    await expect(page.getByText('Hospital time (Asia/Ho_Chi_Minh, UTC+7)', { exact: true })).toBeVisible()
    await expect(page.getByText(prefix + (id === B ? ' Child' : ' Self'), { exact: true })).toBeVisible()
  }
  async function history(expectedCount) {
    await page.getByRole('link', { name: 'My Appointments', exact: true }).last().click()
    await page.getByRole('tab', { name: /^History/ }).click()
    await expect(page.getByRole('tab', { name: `History (${expectedCount})`, exact: true })).toBeVisible()
  }
  async function openConfirmation() {
    const trigger = page.getByRole('button', { name: 'Cancel appointment', exact: true })
    await expect(trigger).toBeEnabled(); await trigger.focus(); await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Cancel this appointment?', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Cancellation reason (optional)', { exact: true })).toBeFocused()
    return dialog
  }
  async function trap(dialog) {
    for (const key of ['Shift+Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key)
      require(await dialog.evaluate(node => node.contains(document.activeElement)), 'Focus escaped real cancellation dialog')
    }
  }
  async function noOverflow() { require(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow') }
  await details(A)
  const doctorResponse = page.waitForResponse(response => new URL(response.url()).pathname.toLowerCase() === `/api/doctors/${ids.doctor}`)
  await page.getByRole('button', { name: 'View doctor information', exact: true }).click()
  const doctor = await (await doctorResponse).json()
  const slotsResponse = page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname.toLowerCase().endsWith('/available-slots') && url.searchParams.get('date') === '2026-10-22' })
  await page.getByLabel('Appointment date', { exact: true }).fill('2026-10-22')
  const slots = await (await slotsResponse).json()
  require(slots.length === 9 && slots.slice(0, 3).every(slot => slot.reason === 'Full'), 'Fixture schedule/availability does not match plan')
  const freeSlot = slots.find(slot => slot.startTime.startsWith('13:00'))
  require(freeSlot?.isAvailable && freeSlot.reason === 'Available', 'Free recovery-marker slot missing')
  await expect(page.getByRole('button', { name: '09:00 - 09:30, Full', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Close doctor details', exact: true }).click()
  const marker = JSON.stringify({ testSetup: 'FE5.2.2 browser-local recovery marker; NO booking POST occurred', kind: 'unresolved', attempt: {
    userId: ids.patient, selection: { doctor: { id: doctor.id, fullName: doctor.fullName, departmentName: doctor.departmentName }, date: '2026-10-22', slot: freeSlot },
    request: { patientProfileId: ids.self, doctorId: ids.doctor, appointmentDate: '2026-10-22', startTime: freeSlot.startTime, symptoms: null },
    previousAppointmentIds: [], startedAt: new Date().toISOString(),
  } })
  const markerHash = createHash('sha256').update(marker).digest('hex')
  await page.evaluate(({ key, marker }) => sessionStorage.setItem(key, marker), { key: markerKey, marker })
  await page.reload()
  await expect(page.getByText('A booking request needs verification. New bookings are paused until its outcome is resolved.', { exact: true })).toBeVisible()
  let dialog = await openConfirmation(); await trap(dialog); await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden(); await expect(page.getByRole('button', { name: 'Cancel appointment', exact: true })).toBeFocused()
  dialog = await openConfirmation()
  await dialog.getByRole('button', { name: 'Keep appointment', exact: true }).click()
  await expect(dialog).toBeHidden(); await expect(page.getByRole('button', { name: 'Cancel appointment', exact: true })).toBeFocused()
  dialog = await openConfirmation()
  await dialog.getByLabel('Cancellation reason (optional)', { exact: true }).fill('  QA522 cancellation reason  ')
  const submit = dialog.getByRole('button', { name: 'Confirm cancellation', exact: true })
  await submit.focus(); await page.keyboard.press('Enter')
  await bounded(aEntered.promise, 'A cancellation request')
  await expect(submit).toBeDisabled()
  await page.keyboard.press('Enter'); await page.keyboard.press('Space')
  const bounds = await submit.boundingBox(); if (bounds) await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  require(counts.patchById[A] === 1, 'Duplicate cancellation request attempted')
  aRelease.resolve()
  await expect(page.getByRole('dialog', { name: 'Appointment cancelled', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Appointment cancelled', exact: true })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Appointment details', exact: true })).toBeFocused()
  await expect(page.getByText('QA522 cancellation reason', { exact: true })).toBeVisible()
  passed(1, 'Pending cancellation'); passed(3, 'duplicate submit: one request'); passed(4, 'reason trimmed and displayed'); passed(14, 'real dialog trap, Escape/Keep trigger return and success-heading fallback')
  await history(4)
  await expect(page.getByRole('article').filter({ hasText: '09:00' })).toBeVisible()
  await details(B)
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow()
  dialog = await openConfirmation(); await trap(dialog)
  require(await dialog.evaluate(node => { const rect = node.getBoundingClientRect(); return Math.abs(rect.width - innerWidth) <= 2 }), 'Mobile dialog is not full width')
  await noOverflow(); await dialog.getByLabel('Cancellation reason (optional)', { exact: true }).fill('   ')
  await dialog.getByRole('button', { name: 'Confirm cancellation', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Appointment cancelled', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Appointment details', exact: true })).toBeFocused()
  await expect(page.getByText('No reason provided', { exact: true })).toBeVisible(); await noOverflow()
  passed(2, 'Confirmed family-profile cancellation'); passed(5, 'blank reason verified null in SQL/real response'); passed(15, '390px responsive page/dialog and desktop layout')
  await history(5); await page.setViewportSize({ width: 1280, height: 900 })
  for (const id of ids.appointments.slice(3)) {
    await details(id); await expect(page.getByRole('button', { name: 'Cancel appointment', exact: true })).toHaveCount(0)
  }
  passed(9, 'five rejected-status fixtures expose no cancellation action')
  await details(C); dialog = await openConfirmation()
  await dialog.getByLabel('Cancellation reason (optional)', { exact: true }).fill('QA522 uncertain outcome')
  await dialog.getByRole('button', { name: 'Confirm cancellation', exact: true }).click()
  await bounded(cCommitted.promise, 'C committed cancellation')
  await expect(dialog.getByText(/The cancellation outcome is uncertain/)).toBeVisible()
  require(await page.evaluate(key => sessionStorage.getItem(key), cancellationKey + C) === 'unresolved', 'Uncertain cancellation guard missing')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await history(6); await details(C)
  await expect(page.getByRole('button', { name: 'Check cancellation status', exact: true })).toBeVisible()
  require(await page.evaluate(key => sessionStorage.getItem(key), cancellationKey + C) === 'unresolved', 'Navigation lost unresolved protection')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Check cancellation status', exact: true })).toBeVisible()
  require(await page.evaluate(key => sessionStorage.getItem(key), cancellationKey + C) === 'unresolved', 'Reload lost unresolved protection')
  passed(10, 'real C commit followed only by response-delivery interruption'); passed(12, 'unresolved protection survives navigation/reload')
  const verification = page.waitForResponse(response => new URL(response.url()).pathname.toLowerCase() === `/api/appointments/${C}`)
  await page.getByRole('button', { name: 'Check cancellation status', exact: true }).click()
  require((await verification).status() === 200, 'Authenticated recovery GET failed')
  await expect(page.getByText('The hospital confirms that this appointment is cancelled.', { exact: true })).toBeVisible()
  await expect(page.getByText('QA522 uncertain outcome', { exact: true })).toBeVisible()
  require(await page.evaluate(key => sessionStorage.getItem(key), cancellationKey + C) === null, 'Successful verification did not clear guard')
  passed(11, 'real authenticated GET reconciles cancellation; no retry PATCH')
  const saved = await page.evaluate(key => sessionStorage.getItem(key), markerKey)
  require(createHash('sha256').update(saved).digest('hex') === markerHash, 'Cancellation changed booking recovery marker')
  await page.getByRole('button', { name: 'Review booking status', exact: true }).click()
  const recovery = page.getByRole('dialog', { name: 'Booking needs verification', exact: true })
  await recovery.getByRole('button', { name: 'Check booking status', exact: true }).click()
  await expect(recovery.getByText(/No single verifiable matching appointment was found/)).toBeVisible()
  await recovery.getByRole('button', { name: 'Close', exact: true }).click()
  require(await page.evaluate(key => sessionStorage.getItem(key), markerKey) === marker, 'Inconclusive real booking GET cleared/changed marker')
  passed(13, 'labelled browser-only booking marker preserved; real inconclusive GET retains protection; no booking POST')
  // Explicit teardown of browser-only test setup, after proving preservation.
  await page.evaluate(key => sessionStorage.removeItem(key), markerKey); await page.reload()
  await expect(page.getByRole('button', { name: 'View doctor information', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View doctor information', exact: true }).click()
  await page.getByLabel('Appointment date', { exact: true }).fill('2026-10-22')
  for (const time of ['09:00 - 09:30', '09:30 - 10:00', '10:00 - 10:30']) await expect(page.getByRole('button', { name: time + ', Available', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Close doctor details', exact: true }).click()
  passed(8, 'all three released slots render Available and enabled after test-marker teardown')
  await history(6); await expect(page.getByRole('tab', { name: 'Upcoming (2)', exact: true })).toBeVisible()
  passed(6, 'all three cancellations moved to History'); passed(7, 'real details/list refresh and 2 Upcoming / 6 History')
  require(counts.login === 1 && counts.patch === 3 && counts.get <= 150 && counts.blocked === 0 && violations.length === 0, 'Request budget or browser guard violation')
  require(Object.values(results).every(value => value === 'PASS'), 'Not all 15 scenarios passed')
} catch (failure) { error = failure; console.log('ACCEPTANCE STOP: ' + failure.message) }
finally {
  aRelease.resolve()
  await Promise.allSettled([...pendingRoutes])
  if (context) await context.close()
  if (browser) await browser.close()
  if (setup) {
    try { cleanup = await sql('cleanup'); console.log('SQL CLEANUP ' + JSON.stringify(cleanup)); require(cleanup.deleted === 16 && cleanup.updates === 3 && cleanup.baselineRestored, 'Cleanup/accounting incomplete') }
    catch (failure) { error ??= failure; console.log('CLEANUP STOP: ' + failure.message + '; known fixture IDs/token must be checked read-only') }
  }
  helper.stdin.end()
  if (helper.exitCode === null) await new Promise(resolve => helper.once('exit', resolve))
  console.log('RESULTS ' + JSON.stringify(results))
  console.log('HTTP ' + JSON.stringify(counts))
  if (violations.length) console.log('GUARD VIOLATIONS ' + JSON.stringify(violations))
}
if (error) process.exitCode = 1
else console.log('FE 5.2.2 PASS: 15/15 browser scenarios and exact-ID cleanup verified')
