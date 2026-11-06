const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const axios = require('axios')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { QueryClient } = require('@tanstack/react-query')

// Fresh production modules per test. HTTP adapters and storage are memory-only;
// no browser session, API request, SQL fixture or authentication mutation occurs.
function loader(overrides = {}) {
  const cache = new Map()
  function load(relative) {
    const base = path.resolve(__dirname, '..', relative)
    const file = [base, base + '.ts', base + '.tsx'].find(existsSync)
    assert.ok(file, 'Application import resolves')
    if (cache.has(file)) return cache.get(file).exports
    const loaded = new Module(file)
    loaded.paths = Module._nodeModulePaths(path.dirname(file))
    const originalRequire = loaded.require.bind(loaded)
    loaded.require = (name) => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)))
        : originalRequire(name)
    cache.set(file, loaded)
    const source = readFileSync(file, 'utf8').replaceAll('import.meta.env', '({ VITE_PORTAL: "staff", VITE_API_BASE_URL: "/api" })').replaceAll('import.meta.hot', 'undefined')
    loaded._compile(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, file)
    return loaded.exports
  }
  return load
}
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const d = '33333333-3333-4333-8333-333333333333'
const session = (userId = a, role = 'Doctor') => ({ userId, role, email: 'qa@example.invalid',
  accessToken: 'offline-access', refreshToken: 'offline-refresh', accessTokenExpiresAt: '2099-01-01T00:00:00Z' })
const doctor = (userId = a, id = d) => ({ userId, id, fullName: 'Nguyễn Văn An', departmentId: b,
  departmentName: 'Department', specialization: 'General', isActive: true })
const response = (config, data, status = 200) => ({ config, data, status, statusText: '', headers: {} })
const unauthorized = config => new axios.AxiosError('Offline rejection', 'ERR_BAD_REQUEST', config, null, response(config, {}, 401))

test('Doctor role allowed; Admin, Patient, unknown and anonymous denied', () => {
  const { canAccessDoctor } = loader()('src/services/doctorAccess.ts')
  assert.equal(canAccessDoctor('Doctor'), true)
  for (const role of ['Admin', 'Patient', 'Unknown', undefined, null]) assert.equal(canAccessDoctor(role), false)
})

test('anonymous boundary preserves Doctor deep link and current login generation', () => {
  const state = { user: null, session: null, status: 'anonymous' }
  const load = loader({ '../hooks/useAuth': { useAuth: () => state, useLogout: () => ({}) },
    'react-router-dom': { useLocation: () => ({ pathname: '/doctor/appointments/123' }), Navigate: 'redirect', Outlet: 'outlet' } })
  const element = load('src/components/AuthBoundary.tsx').AuthBoundary({})
  assert.equal(element.props.to, '/login')
  assert.equal(element.props.state.from, '/doctor/appointments/123')
  assert.equal(element.props.state.generation, load('src/services/authSession.ts').authSession.getGeneration())
})

test('restoring/unavailable sessions do not render protected content', () => {
  let state = { status: 'restoring', user: null }
  const load = loader({ '../hooks/useAuth': { useAuth: () => state, useLogout: () => ({ mutate() {} }) },
    'react-router-dom': { useLocation: () => ({ pathname: '/doctor/queue' }), Navigate: 'redirect', Outlet: 'outlet' } })
  const { AuthBoundary } = load('src/components/AuthBoundary.tsx')
  assert.match(renderToStaticMarkup(AuthBoundary({})), /Restoring session/)
  state = { status: 'unavailable', user: null }
  assert.match(renderToStaticMarkup(AuthBoundary({})), /could not be verified/)
})

test('Doctor child boundary rejects Admin and Patient while allowing Doctor', () => {
  let role = 'Doctor'
  const load = loader({ '../hooks/useAuth': { useAuth: () => ({ user: { role } }) },
    'react-router-dom': { Outlet: 'outlet', Link: 'a' } })
  const { DoctorBoundary } = load('src/components/DoctorBoundary.tsx')
  assert.equal(DoctorBoundary().type, 'outlet')
  for (role of ['Admin', 'Patient', 'Unknown']) assert.match(renderToStaticMarkup(DoctorBoundary()), /Doctor access is required/)
})

test('deep links restore only for Doctor and the original login generation/account', () => {
  const { loginDestination } = loader()('src/services/doctorAccess.ts')
  const state = { from: '/doctor/appointments/123', generation: 4, userId: null }
  assert.equal(loginDestination('Doctor', state, 5, a), state.from)
  assert.equal(loginDestination('Admin', state, 5, a), '/')
  assert.equal(loginDestination('Patient', state, 5, a), '/')
  assert.equal(loginDestination('Doctor', state, 7, b), '/doctor/dashboard')
  assert.equal(loginDestination('Doctor', { ...state, userId: a }, 5, b), '/doctor/dashboard')
})

test('malicious and unsupported redirects are rejected', () => {
  const { loginDestination } = loader()('src/services/doctorAccess.ts')
  for (const from of ['https://evil.invalid', '//evil.invalid', 'javascript:alert(1)', '/\\evil.invalid',
    '/doctor/../admin', '/doctor/appointments/%2f%2fevil.invalid', '/admin', '/doctor/queue?next=//evil.invalid']) {
    assert.equal(loginDestination('Doctor', { from, generation: 1, userId: null }, 2, a), '/doctor/dashboard')
  }
})

test('public boundary restores an allowed Doctor link but keeps Admin at its landing page', () => {
  let role = 'Doctor'
  const load = loader({ '../hooks/useAuth': { useAuth: () => ({ status: 'authenticated', user: session(a, role) }), useLogout: () => ({}) },
    'react-router-dom': { useLocation: () => ({ state: { from: '/doctor/queue', generation: 0, userId: null } }), Navigate: 'redirect', Outlet: 'outlet' } })
  load('src/services/authSession.ts').authSession.setSession(session())
  const { AuthBoundary } = load('src/components/AuthBoundary.tsx')
  assert.equal(AuthBoundary({ publicPage: true }).props.to, '/doctor/queue')
  role = 'Admin'
  assert.equal(AuthBoundary({ publicPage: true }).props.to, '/')
})

test('identity maps exact UserId to a distinct Doctor.Id, preserving Unicode', () => {
  const { resolveCurrentDoctor } = loader()('src/services/doctorsApi.ts')
  const result = resolveCurrentDoctor([doctor(b, a), doctor(a, d)], a)
  assert.equal(result.id, d)
  assert.equal(result.fullName, 'Nguyễn Văn An')
})

test('missing, duplicate, inactive and malformed profiles fail closed', () => {
  const { resolveCurrentDoctor } = loader()('src/services/doctorsApi.ts')
  for (const [rows, code] of [[[], 'missing'], [[doctor(), doctor()], 'ambiguous'],
    [[{ ...doctor(), isActive: false }], 'inactive'], [[{ ...doctor(), userId: undefined }], 'contract']]) {
    assert.throws(() => resolveCurrentDoctor(rows, a), error => error.code === code)
  }
})

test('identity errors distinguish network, authentication, authorization and contract failures', () => {
  const { doctorIdentityMessage, DoctorIdentityError } = loader()('src/services/doctorsApi.ts')
  assert.match(doctorIdentityMessage(new axios.AxiosError('offline')), /could not be reached/)
  assert.match(doctorIdentityMessage(unauthorized({})), /session/)
  assert.match(doctorIdentityMessage(new axios.AxiosError('', '', {}, null, response({}, {}, 403))), /not authorized/)
  assert.match(doctorIdentityMessage(new DoctorIdentityError('contract')), /invalid Doctor profile/)
})

test('identity service uses existing doctors endpoint and propagates cancellation', async () => {
  const signal = new AbortController().signal
  const load = loader({ './apiClient': { apiClient: { get: async (url, options) => {
    assert.equal(url, '/doctors'); assert.equal(options.signal, signal)
    return { data: [doctor()] }
  } } } })
  assert.equal((await load('src/services/doctorsApi.ts').getCurrentDoctor(a, signal)).id, d)
})

test('current Doctor hook keys are account-scoped and disabled for other roles', () => {
  let user = { userId: a, role: 'Doctor' }
  const load = loader({ './useAuth': { useAuth: () => ({ user, status: 'authenticated' }) },
    '@tanstack/react-query': { useQuery: options => options } })
  const { useCurrentDoctor } = load('src/hooks/useCurrentDoctor.ts')
  assert.deepEqual(useCurrentDoctor().queryKey, ['doctorIdentity', a])
  assert.equal(useCurrentDoctor().enabled, true)
  user = { userId: b, role: 'Admin' }
  assert.deepEqual(useCurrentDoctor().queryKey, ['doctorIdentity', b])
  assert.equal(useCurrentDoctor().enabled, false)
})

test('account switches and automatic auth clearing remove identity caches; token rotation does not', () => {
  const load = loader()
  const auth = load('src/services/authSession.ts').authSession
  const client = new QueryClient()
  const unsubscribe = load('src/services/authCache.ts').bindAuthCache(client)
  auth.setSession(session())
  client.setQueryData(['doctorIdentity', a], doctor())
  auth.setSession({ ...session(), accessToken: 'offline-rotated' })
  assert.ok(client.getQueryData(['doctorIdentity', a]))
  auth.setSession(session(b))
  assert.equal(client.getQueryData(['doctorIdentity', a]), undefined)
  client.setQueryData(['doctorIdentity', b], doctor(b))
  auth.clear()
  assert.equal(client.getQueryCache().getAll().length, 0)
  unsubscribe(); client.clear()
})

test('session restoration verifies me and rejects mismatched identity', async () => {
  let me = session()
  const load = loader({ '../services/authApi': { authApi: { me: async () => me } },
    '../services/apiClient': { refreshSession: async () => { throw Error('Not needed') } } })
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession(session(), false)
  await load('src/hooks/useAuth.ts').restoreAuth()
  assert.equal(auth.getSnapshot().status, 'authenticated')
  me = session(b)
  await load('src/hooks/useAuth.ts').restoreAuth()
  assert.equal(auth.getSnapshot().status, 'unavailable')
})

test('logout clears session and query caches before the server response', async () => {
  let calls = 0
  const client = new QueryClient()
  const load = loader({ '@tanstack/react-query': { useQueryClient: () => client, useMutation: options => options },
    '../services/authApi': { authApi: { logout: async () => { calls++; assert.equal(auth.getSnapshot().session, null); assert.equal(client.getQueryCache().getAll().length, 0) } } } })
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession(session()); client.setQueryData(['doctorIdentity', a], doctor())
  await load('src/hooks/useAuth.ts').useLogout().mutationFn()
  assert.equal(calls, 1); client.clear()
})

test('late restoration failure does not invalidate a newly signed-in account', async () => {
  let rejectMe
  const pending = new Promise((_, reject) => { rejectMe = reject })
  const load = loader({ '../services/authApi': { authApi: { me: () => pending } },
    '../services/apiClient': { refreshSession: async () => {} } })
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession(session(), false)
  const restoring = load('src/hooks/useAuth.ts').restoreAuth()
  auth.setSession(session(b))
  rejectMe(Error('Offline failure from old account'))
  await restoring
  assert.equal(auth.getSnapshot().user.userId, b)
  assert.equal(auth.getSnapshot().status, 'authenticated')
})

test('expired session refreshes once before me verification', async () => {
  let refreshes = 0
  const load = loader({ '../services/authApi': { authApi: { me: async () => session() } },
    '../services/apiClient': { refreshSession: async () => { refreshes++; auth.setSession(session(), false) } } })
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession({ ...session(), accessTokenExpiresAt: '2000-01-01T00:00:00Z' }, false)
  await Promise.all([load('src/hooks/useAuth.ts').restoreAuth(), load('src/hooks/useAuth.ts').restoreAuth()])
  assert.equal(refreshes, 1); assert.equal(auth.getSnapshot().status, 'authenticated')
})

test('reload restores the existing staff sessionStorage contract and verifies identity', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new Map([['his-auth-staff', JSON.stringify(session())]])
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } })
  try {
    const load = loader({ '../services/authApi': { authApi: { me: async () => session() } },
      '../services/apiClient': { refreshSession: async () => { throw Error('Not expired') } } })
    const auth = load('src/services/authSession.ts').authSession
    await load('src/hooks/useAuth.ts').restoreAuth()
    assert.equal(auth.getSnapshot().user.userId, a)
    assert.equal(auth.getSnapshot().status, 'authenticated')
    auth.clear()
    assert.equal(storage.size, 0)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous)
    else delete globalThis.sessionStorage
  }
})

test('PATCH/PUT/POST/DELETE HTTP 401 never trigger refresh or replay', async () => {
  const load = loader()
  load('src/services/authSession.ts').authSession.setSession(session())
  const { apiClient, authClient } = load('src/services/apiClient.ts')
  let reads = 0, mutations = 0
  authClient.defaults.adapter = async () => { reads++; throw Error('Must not refresh') }
  apiClient.defaults.adapter = async config => { mutations++; throw unauthorized(config) }
  for (const method of ['patch', 'put', 'post', 'delete']) await assert.rejects(apiClient.request({ method, url: '/offline', skipAuthRetry: true }))
  await assert.rejects(apiClient.patch('/offline')) // Safe even when a future caller omits the explicit flag.
  assert.equal(mutations, 5); assert.equal(reads, 0)
})

test('skipAuthRetry also prevents GET refresh and network failures never retry', async () => {
  const load = loader()
  load('src/services/authSession.ts').authSession.setSession(session())
  const { apiClient, authClient } = load('src/services/apiClient.ts')
  let calls = 0, refreshes = 0
  authClient.defaults.adapter = async () => { refreshes++; throw Error('Must not refresh') }
  apiClient.defaults.adapter = async config => { calls++; throw unauthorized(config) }
  await assert.rejects(apiClient.get('/offline', { skipAuthRetry: true }))
  apiClient.defaults.adapter = async () => { calls++; throw new axios.AxiosError('offline-network') }
  await assert.rejects(apiClient.put('/offline'))
  assert.equal(calls, 2); assert.equal(refreshes, 0)
})

test('parallel GET 401s share one refresh and replay reads only once', async () => {
  const load = loader()
  load('src/services/authSession.ts').authSession.setSession(session())
  const { apiClient, authClient } = load('src/services/apiClient.ts')
  let refreshes = 0, calls = 0
  authClient.defaults.adapter = async config => { refreshes++; await Promise.resolve(); return response(config, { ...session(), accessToken: 'offline-new' }) }
  apiClient.defaults.adapter = async config => { calls++; if (!config.authRetried) throw unauthorized(config); return response(config, []) }
  await Promise.all([apiClient.get('/offline'), apiClient.get('/offline')])
  assert.equal(refreshes, 1); assert.equal(calls, 4)
})

test('responses from a previous login cannot reach a new account, even with the same UserId', async () => {
  const load = loader()
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession(session())
  const { apiClient } = load('src/services/apiClient.ts')
  apiClient.defaults.adapter = async config => { auth.clear(); auth.setSession(session()); return response(config, [doctor()]) }
  await assert.rejects(apiClient.get('/offline'), /Session changed/)
})

test('late 401 from another account cannot refresh or replay', async () => {
  const load = loader()
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession(session())
  const { apiClient, authClient } = load('src/services/apiClient.ts')
  let calls = 0, refreshes = 0
  authClient.defaults.adapter = async () => { refreshes++; throw Error('Must not refresh') }
  apiClient.defaults.adapter = async config => { calls++; auth.setSession(session(b)); throw unauthorized(config) }
  await assert.rejects(apiClient.get('/offline'))
  assert.equal(calls, 1); assert.equal(refreshes, 0)
})

test('legacy landing redirects Doctor only and preserves Admin dashboard', () => {
  let role = 'Admin'
  const load = loader({ '../hooks/useAuth': { useAuth: () => ({ user: { role } }) },
    'react-router-dom': { Navigate: 'redirect' } })
  const { StaffLanding } = load('src/pages/StaffLanding.tsx')
  assert.equal(StaffLanding().type.name, 'StaffDashboard')
  role = 'Doctor'
  assert.equal(StaffLanding().props.to, '/doctor/dashboard')
})

test('route tree includes all six Doctor pages and retains staff compatibility', () => {
  const load = loader({ 'react-router-dom': { createBrowserRouter: routes => routes, Navigate: 'redirect' } })
  const { router } = load('src/routes/router.tsx')
  const secured = router.find(route => route.errorElement)
  const doctorRoutes = secured.children.find(route => route.children?.[0]?.path === '/doctor').children[0]
  assert.deepEqual(doctorRoutes.children.filter(route => route.path).map(route => route.path),
    ['dashboard', 'appointments', 'appointments/:id', 'appointments/:appointmentId/clinical', 'schedule', 'queue'])
  assert.ok(secured.children.some(route => route.path === '/'))
})

test('layout renders navigation, skip link, inactive-profile error and labeled placeholders without fake data', () => {
  const { MemoryRouter } = require('react-router-dom')
  const load = loader({ '../hooks/useAuth': { useAuth: () => ({ user: session() }), useLogout: () => ({ mutate() {}, isPending: false }) },
    '../hooks/useCurrentDoctor': { useCurrentDoctor: () => ({ isPending: false, isError: true, error: new Error(), refetch() {} }) } })
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(load('src/layouts/DoctorLayout.tsx').DoctorLayout)))
  assert.match(html, /Skip to content/); assert.match(html, /Doctor navigation/); assert.match(html, /Retry Doctor profile/)
  const placeholder = renderToStaticMarkup(React.createElement(load('src/pages/DoctorPlaceholder.tsx').DoctorPlaceholder, { title: 'Queue', phase: '7.4' }))
  assert.match(placeholder, /placeholder for Phase 7.4/)
})
