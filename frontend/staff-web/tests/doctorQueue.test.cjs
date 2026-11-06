const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const axios = require('axios')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')
const { QueryClient } = require('@tanstack/react-query')

// Source-based offline harness, matching the earlier frontend regressions.
// API, SignalR and session dependencies are doubles; no network adapter is opened.
function loader(overrides = {}) {
  const cache = new Map()
  function load(relative) {
    const base = path.resolve(__dirname, '..', relative)
    const file = [base, base + '.ts', base + '.tsx'].find(existsSync)
    assert.ok(file)
    if (cache.has(file)) return cache.get(file).exports
    const loaded = new Module(file); loaded.paths = Module._nodeModulePaths(path.dirname(file))
    const original = loaded.require.bind(loaded)
    loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.')
      ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name))) : original(name)
    cache.set(file, loaded)
    const source = readFileSync(file, 'utf8').replaceAll('import.meta.env', '({ VITE_PORTAL: "staff", VITE_API_BASE_URL: "/api" })').replaceAll('import.meta.hot', 'undefined')
    loaded._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file)
    return loaded.exports
  }
  return load
}
const userId = '11111111-1111-4111-8111-111111111111'
const doctorId = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'
const appointmentId = '44444444-4444-4444-8444-444444444444'
const date = '2026-10-29'
const entry = changes => ({ id, appointmentId, queueNumber: 1, status: 'Waiting', patientProfileId: userId,
  patientName: 'Nguyễn Test', doctorId, doctorName: 'Doctor Test', appointmentDate: date, appointmentTime: '09:00:00',
  checkedInAt: '2026-10-29T01:00:00', calledAt: null, startedAt: null, completedAt: null, ...changes })
const reject = status => new axios.AxiosError('Offline rejection', '', {}, null, { status })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)))

test('queue DTO matches exact enum strings and all timestamp/reference fields', () => {
  const { queueEntrySchema, queueStatusSchema } = loader()('src/types/doctorQueue.ts')
  assert.deepEqual(queueStatusSchema.options, ['Waiting', 'Called', 'InService', 'Completed', 'Skipped'])
  for (const status of queueStatusSchema.options) assert.equal(queueEntrySchema.parse(entry({ status })).status, status)
  for (const status of [1, 'waiting', 'in-consultation', 'Confirmed']) assert.equal(queueEntrySchema.safeParse(entry({ status })).success, false)
  assert.equal(queueEntrySchema.safeParse(entry({ appointmentId: undefined })).success, false)
  assert.equal(queueEntrySchema.safeParse(entry({ queueNumber: 0 })).success, false)
})

test('one filter schema validates real statuses and hospital-local dates', () => {
  const load = loader()
  const { queueFilterSchema } = load('src/services/validation.ts')
  assert.equal(queueFilterSchema.safeParse({ date, status: 'InService' }).success, true)
  for (const values of [{ date: '2026-02-30', status: 'Waiting' }, { date, status: 'waiting' }]) assert.equal(queueFilterSchema.safeParse(values).success, false)
  assert.equal(load('src/utils/doctorAppointments.ts').hospitalClock(new Date('2026-10-28T17:00:00Z')).date, date)
})

test('queue GET sends date and AbortSignal, preserving server queue-number order', async () => {
  let call
  const rows = [entry({ queueNumber: 2 }), entry({ id: appointmentId, queueNumber: 4 })]
  const load = loader({ './apiClient': { apiClient: { get: async (...args) => { call = args; return { data: rows } } } } })
  const signal = new AbortController().signal
  const result = await load('src/services/doctorQueueApi.ts').doctorQueueApi.list(doctorId, date, signal)
  assert.deepEqual(call, ['/Queue/doctor', { params: { date }, signal }])
  assert.deepEqual(result.map(row => row.queueNumber), [2, 4])
})

test('foreign Doctor, wrong date, duplicate IDs and invalid query dates fail closed', async () => {
  let rows = [entry()], calls = 0
  const load = loader({ './apiClient': { apiClient: { get: async () => { calls++; return { data: rows } } } } })
  const api = load('src/services/doctorQueueApi.ts').doctorQueueApi
  await assert.rejects(api.list(doctorId, 'invalid')); assert.equal(calls, 0)
  for (const invalid of [[entry({ doctorId: userId })], [entry({ appointmentDate: '2026-10-30' })], [entry(), entry()]]) {
    rows = invalid; await assert.rejects(api.list(doctorId, date))
  }
})

test('each supported action uses bodyless PUT and skipAuthRetry; unsupported actions never send', async () => {
  const calls = []; let responseRow
  const load = loader({ './apiClient': { apiClient: { put: async (...args) => { calls.push(args); return { status: 200, data: responseRow } } } } })
  const api = load('src/services/doctorQueueApi.ts').doctorQueueApi
  const transitions = load('src/types/doctorQueue.ts').queueTransitions
  for (const [action, transition] of Object.entries(transitions)) {
    responseRow = entry({ status: transition.to })
    assert.equal((await api.act(entry({ status: transition.from }), action)).status, transition.to)
    assert.deepEqual(calls.at(-1), [`/Queue/${id}/${action}`, undefined, { skipAuthRetry: true }])
  }
  await assert.rejects(api.act(entry(), 'skip')); await assert.rejects(api.act(entry(), 'complete'))
  assert.equal(calls.length, 3)
  responseRow = entry({ status: 'Called', appointmentId: userId }); await assert.rejects(api.act(entry(), 'call'))
})

test('400/401/403/404/409 remain distinct; timeout and server failures are uncertain', () => {
  const { queueError } = loader()('src/services/doctorQueueApi.ts')
  const messages = [400, 401, 403, 404, 409].map(status => { const result = queueError(reject(status)); assert.equal(result.definitive, true); return result.message })
  assert.equal(new Set(messages).size, 5)
  assert.equal(queueError(reject(500)).definitive, false)
  assert.equal(queueError(new axios.AxiosError('offline timeout', 'ECONNABORTED')).definitive, false)
})

function actionFixture(options = {}) {
  let marker = null, active = true, current = entry()
  const calls = { puts: 0, reads: 0, updates: 0 }
  const deps = { userId, doctorId, entry: entry(), active: () => active,
    storage: { read: () => marker, write: value => { marker = value }, remove: () => { marker = null } },
    mutate: async (row, action) => { calls.puts++; return options.mutate ? options.mutate(row, action) : entry({ status: { call: 'Called', start: 'InService', complete: 'Completed' }[action] }) },
    read: async () => { calls.reads++; return options.read ? options.read() : current },
    update: () => { calls.updates++ },
  }
  const create = loader()('src/services/queueActionController.ts').createQueueActionController
  return { create: () => create(deps), deps, calls, current: row => { current = row }, deactivate: () => { active = false }, get marker() { return marker } }
}

test('synchronous duplicate lock prevents two PUTs before the first settles', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const f = actionFixture({ mutate: () => pending }); const c = f.create()
  const first = c.submit(entry(), 'call'); await c.submit(entry(), 'call')
  assert.equal(f.calls.puts, 1); assert.equal(c.getSnapshot().phase, 'pending')
  release(entry({ status: 'Called' })); await first
  await c.submit(entry(), 'call'); assert.equal(f.calls.puts, 1)
})

test('valid sequential actions remain usable without replaying earlier transitions', async () => {
  const f = actionFixture(); const c = f.create()
  await c.submit(entry(), 'complete'); assert.equal(f.calls.puts, 0)
  await c.submit(entry(), 'call'); await c.submit(entry({ status: 'Called' }), 'start'); await c.submit(entry({ status: 'InService' }), 'complete')
  assert.equal(f.calls.puts, 3); assert.equal(c.getSnapshot().record.status, 'Completed')
  await c.submit(entry({ status: 'InService' }), 'complete'); assert.equal(f.calls.puts, 3)
})

test('uncertain PUT reconciles through GET once, without retrying mutation', async () => {
  const f = actionFixture({ mutate: async () => { throw new axios.AxiosError('Offline') }, read: async () => entry({ status: 'Called' }) })
  const c = f.create(); await c.submit(entry(), 'call')
  assert.equal(f.calls.puts, 1); assert.equal(f.calls.reads, 1); assert.equal(c.getSnapshot().phase, 'success'); assert.equal(f.marker, null)
})

test('unchanged status stays unresolved across reload; later GET can resolve it', async () => {
  const f = actionFixture({ mutate: async () => { throw Error('Offline') } }); const c = f.create()
  await c.submit(entry(), 'call'); assert.equal(c.getSnapshot().phase, 'unresolved')
  const reload = f.create(); await reload.submit(entry(), 'call'); assert.equal(f.calls.puts, 1)
  f.current(entry({ status: 'Called' })); await reload.verify()
  assert.equal(reload.getSnapshot().phase, 'success'); assert.equal(f.marker, null); assert.equal(f.calls.puts, 1)
})

test('business rejections reconcile while failed or foreign reads retain protection', async () => {
  for (const status of [400, 404, 409]) {
    const f = actionFixture({ mutate: async () => { throw reject(status) } }); const c = f.create()
    await c.submit(entry(), 'call'); assert.equal(f.calls.reads, 1); assert.equal(c.getSnapshot().phase, 'error')
  }
  for (const read of [async () => { throw Error('Offline') }, async () => entry({ doctorId: userId })]) {
    const f = actionFixture({ mutate: async () => { throw Error('Offline') }, read }); const c = f.create()
    await c.submit(entry(), 'call'); assert.equal(c.getSnapshot().phase, 'unresolved'); assert.ok(f.marker)
  }
})

test('late result after account change cannot update the new account', async () => {
  let release
  const f = actionFixture({ mutate: () => new Promise(resolve => { release = resolve }) }); const c = f.create()
  const first = c.submit(entry(), 'call'); f.deactivate(); release(entry({ status: 'Called' })); await first
  assert.equal(f.calls.updates, 0); await c.verify(); assert.equal(f.calls.reads, 0)
})

function realtimeFixture(factory) {
  const connections = [], authListeners = new Set(); let active = true, tokens = 0
  const create = token => {
    const handlers = new Map()
    const connection = { starts: 0, stops: 0, handlers, token,
      start: async () => { connection.starts++ }, stop: async () => { connection.stops++ },
      on: (event, handler) => { assert.equal(handlers.has(event), false); handlers.set(event, handler) },
      off: (event, handler) => { assert.equal(handlers.get(event), handler); handlers.delete(event) },
      onreconnecting: handler => { connection.reconnecting = handler }, onreconnected: handler => { connection.reconnected = handler }, onclose: handler => { connection.closed = handler },
    }
    if (factory) factory(connection, connections.length)
    connections.push(connection); return connection
  }
  const manager = loader()('src/services/queueRealtimeManager.ts').createQueueRealtimeManager({ create,
    token: async () => { tokens++; return 'offline-token' }, active: () => active,
    subscribeAuth: handler => { authListeners.add(handler); return () => authListeners.delete(handler) } })
  const scope = { userId, doctorId, generation: 1 }
  return { manager, scope, connections, authListeners, get tokens() { return tokens }, logout: () => { active = false; [...authListeners].forEach(handler => handler()) } }
}

test('shared scope has one connection/handler; final release detaches and stops', async () => {
  const f = realtimeFixture(); const a = [], b = []
  const releaseA = f.manager.acquire(f.scope, date => a.push(date)), releaseB = f.manager.acquire(f.scope, date => b.push(date))
  await flush(); assert.equal(f.connections.length, 1); assert.equal(f.connections[0].handlers.size, 1)
  releaseA(); assert.equal(f.connections[0].stops, 0)
  releaseB(); assert.equal(f.connections[0].stops, 1); assert.equal(f.connections[0].handlers.size, 0); assert.equal(f.authListeners.size, 0)
  await flush()
})

test('StrictMode setup-cleanup-setup does not start a disposed connection', async () => {
  const f = realtimeFixture()
  const first = f.manager.acquire(f.scope, () => {}); first()
  const second = f.manager.acquire(f.scope, () => {}); await flush()
  assert.equal(f.connections.length, 1); assert.equal(f.connections[0].starts, 1)
  second(); await flush()
})

test('new scope waits until the previous connection stop is complete', async () => {
  let finishStop
  const f = realtimeFixture((connection, index) => { if (!index) connection.stop = () => { connection.stops++; return new Promise(resolve => { finishStop = resolve }) } })
  const first = f.manager.acquire(f.scope, () => {}); await flush(); first()
  const second = f.manager.acquire(f.scope, () => {}); await flush()
  assert.equal(f.connections.length, 1)
  finishStop(); await flush(); assert.equal(f.connections.length, 2)
  second(); await flush()
})

test('StrictMode cleanup also stops an in-flight start before replacement', async () => {
  let finishStart
  const f = realtimeFixture((connection, index) => {
    if (index === 0) {
      connection.start = () => { connection.starts++; return new Promise(resolve => { finishStart = resolve }) }
      connection.stop = async () => { connection.stops++; finishStart() }
    }
  })
  const first = f.manager.acquire(f.scope, () => {}); await flush()
  assert.equal(f.connections[0].starts, 1)
  first(); assert.equal(f.connections[0].stops, 1)
  const second = f.manager.acquire(f.scope, () => {}); await flush()
  assert.equal(f.connections.length, 2); assert.equal(f.connections[0].handlers.size, 0)
  assert.equal(f.connections[1].starts, 1)
  second(); await flush()
})

test('unverified cleanup blocks replacement connections instead of forcing another start', async () => {
  const f = realtimeFixture(connection => { connection.stop = async () => { connection.stops++; throw Error('OFFLINE_SECRET') } })
  const first = f.manager.acquire(f.scope, () => {}); await flush(); first(); await flush()
  assert.equal(f.manager.getSnapshot().status, 'unavailable')
  const second = f.manager.acquire(f.scope, () => {}); await flush()
  assert.equal(f.connections.length, 1); assert.equal(f.manager.getSnapshot().status, 'unavailable')
  assert.doesNotMatch(f.manager.getSnapshot().message, /OFFLINE_SECRET/)
  second(); await flush()
})

test('QueueUpdated invalidates scoped reads only; unrelated Doctor events are ignored', async () => {
  const f = realtimeFixture(), reads = []
  const release = f.manager.acquire(f.scope, date => reads.push(date)); await flush(); reads.length = 0
  const handler = f.connections[0].handlers.get('QueueUpdated')
  handler(entry()); handler(entry()); await flush(); assert.deepEqual(reads, [date])
  reads.length = 0; handler(entry({ doctorId: userId })); await flush(); assert.equal(reads.length, 0)
  handler({ malformed: true }); await flush(); assert.deepEqual(reads, [undefined])
  release(); await flush()
})

test('reconnect performs authoritative refetch and exposes bounded disconnect fallback', async () => {
  const f = realtimeFixture(), reads = []
  const release = f.manager.acquire(f.scope, date => reads.push(date)); await flush(); reads.length = 0
  const connection = f.connections[0]
  connection.reconnecting(); assert.equal(f.manager.getSnapshot().status, 'reconnecting')
  connection.reconnected(); await flush(); assert.deepEqual(reads, [undefined])
  connection.closed(); assert.equal(f.manager.getSnapshot().status, 'unavailable'); assert.equal(connection.starts, 1)
  release(); await flush()
})

test('logout/account switch stops immediately; stale token callbacks and events are rejected', async () => {
  const f = realtimeFixture(), reads = []
  const release = f.manager.acquire(f.scope, date => reads.push(date)); await flush(); reads.length = 0
  const connection = f.connections[0], staleHandler = connection.handlers.get('QueueUpdated')
  assert.equal(await connection.token(), 'offline-token')
  f.logout(); assert.equal(connection.stops, 1); assert.equal(connection.handlers.size, 0)
  staleHandler(entry()); await assert.rejects(connection.token()); await flush(); assert.equal(reads.length, 0)
  release(); await flush()
})

test('failed start does not loop or log provider exceptions', async () => {
  const f = realtimeFixture(connection => { connection.start = async () => { connection.starts++; throw Error('OFFLINE_SECRET') } })
  const release = f.manager.acquire(f.scope, () => {}); await flush()
  assert.equal(f.connections.length, 1); assert.equal(f.connections[0].starts, 1)
  assert.equal(f.manager.getSnapshot().status, 'unavailable'); assert.doesNotMatch(f.manager.getSnapshot().message, /OFFLINE_SECRET/)
  release(); await flush()
})

test('connection factory configures same-origin JWT, bounded reconnect and no token logging', () => {
  const settings = {}
  class Builder {
    withUrl(url, options) { settings.url = url; settings.options = options; return this }
    withAutomaticReconnect(delays) { settings.delays = delays; return this }
    configureLogging(level) { settings.level = level; return this }
    build() { return settings }
  }
  const token = async () => 'offline-token'
  loader({ '@microsoft/signalr': { HubConnectionBuilder: Builder, LogLevel: { None: 'None' } } })('src/services/realtimeQueue.ts').createQueueConnection(token)
  assert.equal(settings.url, '/hubs/queue'); assert.equal(settings.options.accessTokenFactory, token)
  assert.deepEqual(settings.delays, [0, 2000, 10000, 30000]); assert.equal(settings.level, 'None')
})

test('token provider reads latest token, refreshes expired sessions once, rejects account/role changes', async () => {
  let refreshes = 0
  const load = loader({ './apiClient': { refreshSession: async () => { refreshes++; auth.setSession({ ...auth.getSnapshot().session, accessToken: 'offline-new', accessTokenExpiresAt: '2099-01-01T00:00:00Z' }) } } })
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession({ userId, role: 'Doctor', accessToken: 'offline-old', accessTokenExpiresAt: '2000-01-01T00:00:00Z' })
  const scope = { userId, doctorId, generation: auth.getAccountGeneration() }
  const { currentQueueToken } = load('src/services/queueRealtimeAuth.ts')
  assert.equal(await currentQueueToken(scope), 'offline-new'); assert.equal(refreshes, 1)
  assert.equal(await currentQueueToken(scope), 'offline-new'); assert.equal(refreshes, 1)
  auth.clear(); await assert.rejects(currentQueueToken(scope))
  auth.setSession({ userId, role: 'Admin', accessToken: 'offline-admin', accessTokenExpiresAt: '2099-01-01T00:00:00Z' })
  await assert.rejects(currentQueueToken({ ...scope, generation: auth.getAccountGeneration() }))
})

test('queue hook scopes cache to account/Doctor/date with periodic fallback and no retries', () => {
  const load = loader({ './useAuth': { useAuth: () => ({ status: 'authenticated', user: { userId, role: 'Doctor' } }) },
    './useCurrentDoctor': { useCurrentDoctor: () => ({ isSuccess: true, data: { id: doctorId } }) },
    '@tanstack/react-query': { useQuery: options => options } })
  const { useDoctorQueue } = load('src/hooks/useDoctorQueue.ts')
  const query = useDoctorQueue(date)
  assert.deepEqual(query.queryKey, ['doctorQueue', userId, doctorId, date]); assert.equal(query.refetchInterval, 30000); assert.equal(query.retry, false)
  assert.equal(useDoctorQueue('invalid').enabled, false)
})

test('queue action hook invalidates queue and appointment/dashboard scopes after success', async () => {
  const client = new QueryClient(), invalidated = []
  client.invalidateQueries = async options => { invalidated.push(options.queryKey) }
  const load = loader({ react: { ...React, useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    '@tanstack/react-query': { useQueryClient: () => client }, './useAuth': { useAuth: () => ({ user: { userId, role: 'Doctor' } }) },
    './doctorQueueApi': { doctorQueueApi: { act: async () => entry({ status: 'Called' }) }, queueError: () => ({ definitive: false, message: '' }) } })
  load('src/services/authSession.ts').authSession.setSession({ userId, role: 'Doctor' })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
  try {
    const operation = load('src/hooks/useQueueAction.ts').useQueueAction(entry())
    await operation.submit(entry(), 'call')
    assert.deepEqual(invalidated, [['doctorQueue', userId, doctorId, date], ['doctorAppointments', userId, doctorId]])
  } finally { client.clear(); if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage }
})

test('status-specific controls contain no unsupported actions and expose uncertainty', () => {
  let state = { phase: 'idle', message: '', submit() {}, verify() {} }
  const load = loader({ '../hooks/useQueueAction': { useQueueAction: () => state } })
  const Card = load('src/components/DoctorQueueCard.tsx').DoctorQueueCard
  for (const [status, label] of [['Waiting', 'Call Patient'], ['Called', 'Start Examination'], ['InService', 'Complete Queue Entry']]) assert.match(render(Card, { entry: entry({ status }), allowActions: true }), new RegExp(label))
  for (const status of ['Completed', 'Skipped']) assert.doesNotMatch(render(Card, { entry: entry({ status }), allowActions: true }), /Call Patient|Start Examination|Complete Queue Entry/)
  state = { ...state, phase: 'unresolved', message: 'Unresolved operation' }
  assert.match(render(Card, { entry: entry(), allowActions: true }), /Check queue status/)
})

test('queue page shows manual fallback, loading/error/empty states and status filtering', () => {
  let query = { isSuccess: true, isPending: false, isError: false, isFetching: false, data: [], refetch() {} }, status = 'all'
  const load = loader({ '../hooks/useDoctorQueue': { useDoctorQueue: () => query },
    '../hooks/useQueueRealtime': { useQueueRealtime: () => ({ status: 'unavailable', message: 'Manual refresh available', reconnect() {} }) },
    '../hooks/useQueueFilterForm': { useQueueFilterForm: () => ({ control: {}, reset() {} }) },
    'react-hook-form': { useWatch: () => ({ date, status }) },
    '../components/QueueFilter': { QueueFilter: () => null }, '../components/DoctorQueueCard': { DoctorQueueCard: ({ entry }) => React.createElement('li', null, entry.patientName) } })
  const Page = load('src/pages/DoctorQueuePage.tsx').DoctorQueuePage
  assert.match(render(Page), /Refresh queue/); assert.match(render(Page), /No queue entries match/); assert.match(render(Page), /not clinical-record finalization/)
  query = { ...query, data: [entry(), entry({ status: 'Completed', id: appointmentId })] }; status = 'Completed'
  assert.match(render(Page), /1 queue entries in this view/)
  query = { ...query, isSuccess: false, isPending: true }; assert.match(render(Page), /Loading queue/)
  query = { ...query, isPending: false, isError: true, error: reject(409) }; assert.match(render(Page), /changed concurrently/)
})
