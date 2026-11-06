const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { QueryClient } = require('@tanstack/react-query')

// Source-based integration harness. Every HTTP, storage and realtime dependency is
// replaced before the application module is evaluated; this file opens no sockets.
function loader(overrides = {}) {
  const cache = new Map()
  function load(relative) {
    const base = path.resolve(__dirname, '..', relative)
    const file = [base, base + '.ts', base + '.tsx'].find(existsSync)
    assert.ok(file, `Missing source module: ${relative}`)
    if (cache.has(file)) return cache.get(file).exports
    const loaded = new Module(file)
    loaded.paths = Module._nodeModulePaths(path.dirname(file))
    const original = loaded.require.bind(loaded)
    loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.')
      ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name))) : original(name)
    cache.set(file, loaded)
    const source = readFileSync(file, 'utf8')
      .replaceAll('import.meta.env', '({ VITE_PORTAL: "staff", VITE_API_BASE_URL: "/api" })')
      .replaceAll('import.meta.hot', 'undefined')
    loaded._compile(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, file)
    return loaded.exports
  }
  return load
}

const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '11111111-1111-4111-8111-111111111112'
const doctorId = '22222222-2222-4222-8222-222222222222'
const appointmentId = '33333333-3333-4333-8333-333333333333'
const profileId = '44444444-4444-4444-8444-444444444444'
const queueId = '55555555-5555-4555-8555-555555555555'
const date = '2026-10-29'

const appointment = changes => ({
  id: appointmentId, patientProfileId: profileId, patientName: 'Nguyễn Minh An', doctorId,
  doctorName: 'Dr. Trần Minh', departmentId: '66666666-6666-4666-8666-666666666666',
  departmentName: 'Internal Medicine', appointmentDate: date, startTime: '09:00:00',
  endTime: '09:30:00', symptoms: 'Mocked integration data', status: 'Pending',
  createdAt: '2026-10-20T01:00:00Z', updatedAt: null, cancelledAt: null,
  cancellationReason: null, ...changes,
})
const queueEntry = changes => ({
  id: queueId, appointmentId, queueNumber: 7, status: 'Waiting', patientProfileId: profileId,
  patientName: 'Nguyễn Minh An', doctorId, doctorName: 'Dr. Trần Minh', appointmentDate: date,
  appointmentTime: '09:00:00', checkedInAt: '2026-10-29T01:30:00Z', calledAt: null,
  startedAt: null, completedAt: null, ...changes,
})
function memoryStorage() {
  let value = null
  return { read: () => value, write: next => { value = next }, remove: () => { value = null } }
}

test('mocked Doctor workflow keeps appointment and queue transitions independent', async () => {
  const load = loader()
  const createConfirmation = load('src/services/confirmationController.ts').createConfirmationController
  const createQueueAction = load('src/services/queueActionController.ts').createQueueActionController
  let row = appointment()
  let entry = queueEntry()
  let confirmRequests = 0
  const confirmation = createConfirmation({ userId, doctorId, id: appointmentId, storage: memoryStorage(),
    active: () => true, confirm: async () => { confirmRequests++; row = appointment({ status: 'Confirmed' }); return row },
    read: async () => row, update: next => { row = next } })
  await confirmation.submit(row)
  assert.equal(confirmRequests, 1)
  assert.equal(row.status, 'Confirmed')

  const actions = []
  const controller = createQueueAction({ userId, doctorId, entry, storage: memoryStorage(), active: () => true,
    mutate: async (current, action) => {
      actions.push(action)
      entry = queueEntry({ status: { call: 'Called', start: 'InService', complete: 'Completed' }[action] })
      return entry
    }, read: async () => entry, update: next => { entry = next } })
  await controller.submit(entry, 'call')
  await controller.submit(entry, 'start')
  await controller.submit(entry, 'complete')
  assert.deepEqual(actions, ['call', 'start', 'complete'])
  assert.equal(entry.status, 'Completed')
  assert.equal(row.status, 'Confirmed', 'queue completion must not claim clinical or appointment completion client-side')
})

test('confirmation uncertainty survives controller recreation and never replays PATCH', async () => {
  const create = loader()('src/services/confirmationController.ts').createConfirmationController
  const storage = memoryStorage()
  let requests = 0
  let server = appointment()
  const dependencies = () => ({ userId, doctorId, id: appointmentId, storage, active: () => true,
    confirm: async () => { requests++; throw new Error('response delivery interrupted') },
    read: async () => server, update: next => { server = next } })
  const first = create(dependencies())
  await first.submit(server)
  assert.equal(first.getSnapshot().phase, 'unresolved')
  const afterNavigation = create(dependencies())
  await afterNavigation.submit(server)
  assert.equal(requests, 1)
  server = appointment({ status: 'Confirmed' })
  await afterNavigation.verify()
  assert.equal(afterNavigation.getSnapshot().phase, 'success')
  assert.equal(requests, 1)
})

test('queue uncertainty survives navigation, reconciles once and never replays PUT', async () => {
  const create = loader()('src/services/queueActionController.ts').createQueueActionController
  const storage = memoryStorage()
  let requests = 0
  let server = queueEntry()
  const dependencies = () => ({ userId, doctorId, entry: queueEntry(), storage, active: () => true,
    mutate: async () => { requests++; throw new Error('response delivery interrupted') },
    read: async () => server, update: next => { server = next } })
  const first = create(dependencies())
  await first.submit(server, 'call')
  assert.equal(first.getSnapshot().phase, 'unresolved')
  const afterNavigation = create(dependencies())
  await afterNavigation.submit(server, 'call')
  assert.equal(requests, 1)
  server = queueEntry({ status: 'Called' })
  await afterNavigation.verify()
  assert.equal(afterNavigation.getSnapshot().phase, 'success')
  assert.equal(requests, 1)
})

test('account changes clear all Doctor and patient-bearing QueryClient cache entries', () => {
  const store = new Map()
  global.sessionStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) }
  const load = loader()
  const { authSession } = load('src/services/authSession.ts')
  const { bindAuthCache } = load('src/services/authCache.ts')
  const client = new QueryClient()
  const stop = bindAuthCache(client)
  const session = (id, role = 'Doctor') => ({ accessToken: 'synthetic', refreshToken: 'synthetic',
    accessTokenExpiresAt: '2099-01-01T00:00:00Z', refreshTokenExpiresAt: '2099-01-02T00:00:00Z',
    userId: id, email: `${id}@example.invalid`, role })
  authSession.setSession(session(userId))
  client.setQueryData(['doctorAppointments', userId], [appointment()])
  authSession.setSession(session(otherUserId))
  assert.equal(client.getQueryCache().getAll().length, 0)
  client.setQueryData(['doctorQueue', otherUserId], [queueEntry()])
  authSession.clear()
  assert.equal(client.getQueryCache().getAll().length, 0)
  stop()
  delete global.sessionStorage
})

test('dashboard and appointment list derive consistent hospital-local ordering from one response', () => {
  const utilities = loader()('src/utils/doctorAppointments.ts')
  const rows = [
    appointment({ startTime: '09:00:00', status: 'Confirmed' }),
    appointment({ id: '77777777-7777-4777-8777-777777777777', startTime: '10:00:00' }),
    appointment({ id: '88888888-8888-4888-8888-888888888888', startTime: '08:00:00', status: 'Cancelled' }),
  ]
  const now = new Date('2026-10-29T01:45:00Z') // 08:45 Asia/Ho_Chi_Minh
  const summary = utilities.dashboardSummary(rows, now)
  assert.equal(summary.total, 3)
  assert.deepEqual(summary.upcoming.map(row => row.startTime), ['09:00:00', '10:00:00'])
  assert.equal(summary.upcoming.some(row => row.status === 'Cancelled'), false)
  assert.equal(utilities.hospitalClock(new Date('2026-10-28T17:00:00Z')).date, date)
})

test('route source uses lazy Doctor chunks while retaining all protected deep links', () => {
  const source = readFileSync(path.resolve(__dirname, '../src/routes/router.tsx'), 'utf8')
  for (const route of ['dashboard', 'appointments', 'appointments/:id', 'appointments/:appointmentId/clinical', 'schedule', 'queue']) {
    assert.match(source, new RegExp(`path: '${route.replace('/', '\\/')}'`))
  }
  assert.equal((source.match(/lazy: async/g) ?? []).length, 7)
  assert.match(source, /element: <DoctorBoundary \/>/)
  assert.doesNotMatch(source, /import \{ DoctorDashboard \}/)
  assert.doesNotMatch(source, /import \{ DoctorQueuePage \}/)
})
