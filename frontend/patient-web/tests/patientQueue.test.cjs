const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

function load(relative, overrides = {}, cache = new Map()) {
  const base = path.resolve(__dirname, '..', relative)
  const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
  assert.ok(file, `Missing module ${relative}`)
  if (cache.has(file)) return cache.get(file).exports
  const loaded = new Module(file); loaded.paths = Module._nodeModulePaths(path.dirname(file))
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.')
    ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)), overrides, cache) : originalRequire(name)
  cache.set(file, loaded)
  loaded._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file)
  return loaded.exports
}

const appointment = {
  id: '11111111-1111-4111-8111-111111111111', patientProfileId: '22222222-2222-4222-8222-222222222222',
  patientName: 'Patient', doctorId: '33333333-3333-4333-8333-333333333333', doctorName: 'Doctor',
  departmentId: '44444444-4444-4444-8444-444444444444', departmentName: 'Department', appointmentDate: '2026-11-07',
  startTime: '09:00:00', endTime: '09:30:00', symptoms: null, status: 'Confirmed', createdAt: '2026-11-01T01:00:00Z',
  updatedAt: null, cancelledAt: null, cancellationReason: null,
}
const entry = (changes = {}) => ({ id: '55555555-5555-4555-8555-555555555555', appointmentId: appointment.id,
  queueNumber: 3, status: 'Waiting', patientProfileId: appointment.patientProfileId, patientName: appointment.patientName,
  doctorId: appointment.doctorId, doctorName: appointment.doctorName, appointmentDate: appointment.appointmentDate,
  appointmentTime: appointment.startTime, checkedInAt: '2026-11-07T02:00:00Z', calledAt: null, startedAt: null,
  completedAt: null, ...changes })

function service(rows = [entry()]) {
  const calls = []
  const apiClient = {
    get: async (...args) => { calls.push(['get', ...args]); return { data: rows } },
    post: async (...args) => { calls.push(['post', ...args]); return { status: 200, data: rows[0] } },
  }
  return { ...load('src/services/patientQueueApi.ts', { './apiClient': { apiClient } }), calls }
}

test('patient queue schema accepts exact backend statuses and nullable timestamps', () => {
  const schema = load('src/types/patientQueue.ts').patientQueueEntrySchema
  for (const status of ['Waiting', 'Called', 'InService', 'Completed', 'Skipped']) {
    assert.equal(schema.safeParse(entry({ status })).success, true)
  }
  assert.equal(schema.safeParse(entry({ status: 'Pending' })).success, false)
})

test('queue status and check-in use exact active endpoints with no mutation replay', async () => {
  const api = service()
  assert.equal((await api.patientQueueApi.my()).length, 1)
  assert.equal((await api.patientQueueApi.checkIn(appointment)).appointmentId, appointment.id)
  assert.deepEqual(api.calls.map(call => [call[0], call[1]]), [
    ['get', '/Queue/my'], ['post', `/Queue/check-in/${appointment.id}`],
  ])
  assert.equal(api.calls[1][3].skipAuthRetry, true)
})

test('foreign, duplicate and mismatched queue responses fail closed', async () => {
  await assert.rejects(service([entry({ patientProfileId: '66666666-6666-4666-8666-666666666666' })]).patientQueueApi.checkIn(appointment))
  await assert.rejects(service([entry(), entry({ id: '77777777-7777-4777-8777-777777777777' })]).patientQueueApi.my(), /Duplicate/)
})

test('check-in errors distinguish definitive rejection from uncertain outcome', () => {
  const api = service()
  for (const status of [400, 401, 403, 404, 409]) {
    assert.equal(api.checkInError({ isAxiosError: true, response: { status } }).definitive, true)
  }
  assert.equal(api.checkInError({ isAxiosError: true }).definitive, false)
  assert.match(api.checkInError({ isAxiosError: true }).message, /uncertain/i)
})

test('check-in hook has one synchronous lock, one reconciliation GET and no retry', () => {
  const hook = readFileSync(path.resolve(__dirname, '../src/hooks/usePatientQueue.ts'), 'utf8')
  assert.match(hook, /working\.current/); assert.match(hook, /retry: false/)
  assert.match(hook, /await patientQueueApi\.checkIn/); assert.match(hook, /await patientQueueApi\.my\(\)/)
  assert.doesNotMatch(hook, /localStorage|sessionStorage|console\./)
})

test('appointment detail limits check-in to a Confirmed hospital-date appointment and renders queue status', () => {
  const page = readFileSync(path.resolve(__dirname, '../src/pages/AppointmentDetailsPage.tsx'), 'utf8')
  assert.match(page, /status === 'Confirmed'.*appointmentDate === hospitalToday\(\)/s)
  assert.match(page, /Queue status/); assert.match(page, /queueNumber/); assert.match(page, /Check in/)
  assert.match(page, /disabled=\{!canCheckIn\}/)
})
