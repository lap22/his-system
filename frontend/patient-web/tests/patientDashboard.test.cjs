const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')
const { CssBaseline, ThemeProvider } = require('@mui/material')

// Render the real Dashboard and exercise the existing cache callbacks in memory.
// No authentication, HTTP requests, database fixtures or generated artifacts.
function loadSource(relative, overrides = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename)
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name]
    if (!name.startsWith('.')) return originalRequire(name)
    const base = path.resolve(path.dirname(filename), name)
    const resolved = [base, base + '.ts', base + '.tsx'].find(existsSync)
    assert.ok(resolved, 'Application import resolves: ' + name)
    return loadSource(resolved, overrides, cache)
  }
  cache.set(filename, loaded)
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename)
  return loaded.exports
}

const profile = (fullName = 'Nguyễn Văn An', isDefault = true, id = 'profile-self') => ({
  id, fullName, isDefault, relationship: 'Self', dateOfBirth: '2000-01-01', gender: 'Other',
})
const success = (data) => ({ data, isSuccess: true, isPending: false, isError: false, isFetching: false, fetchStatus: 'idle' })
let profileQuery = success([])
let appointmentQuery = success([])
const { healthcareTheme } = loadSource('src/theme/healthcareTheme.ts')
const { PatientDashboard } = loadSource('src/pages/PatientDashboard.tsx', {
  '../hooks/usePatientProfiles': { usePatientProfiles: () => profileQuery },
  '../hooks/useAppointments': { useMyAppointments: () => appointmentQuery },
  '../services/patientProfilesApi': { profileErrorMessage: () => 'Profile request failed' },
  '../services/appointmentsApi': { appointmentReadError: () => 'Appointment request failed' },
})
function render(profiles = success([]), appointments = success([])) {
  profileQuery = profiles
  appointmentQuery = appointments
  return renderToStaticMarkup(React.createElement(ThemeProvider, { theme: healthcareTheme },
    React.createElement(CssBaseline),
    React.createElement(MemoryRouter, null, React.createElement(PatientDashboard))))
}
function greeting(html) {
  const match = html.match(/<p[^>]*aria-live="polite"[^>]*>(.*?)<\/p>/s)
  assert.ok(match, 'Greeting remains an accessible live paragraph')
  return match[1]
}

test('greeting uses only the default profile and normalizes surrounding and repeated whitespace', () => {
  assert.equal(greeting(render(success([
    profile('Other family member', false, 'other-profile'), profile('  Nguyễn\t Văn   An \n'),
  ]))), 'Welcome back, Nguyễn Văn An!')
})

test('no profiles and a missing default use the neutral greeting without choosing another profile', () => {
  assert.equal(greeting(render(success([]))), 'Welcome back!')
  assert.equal(greeting(render(success([profile('Family member', false)]))), 'Welcome back!')
})

test('empty and whitespace-only default names use the neutral greeting', () => {
  for (const name of ['', ' \t\n ', '\u00a0\u2003']) {
    assert.equal(greeting(render(success([profile(name)]))), 'Welcome back!')
  }
})

test('Vietnamese Unicode and long names are preserved and markup in names is escaped', () => {
  const longName = 'Nguyễn Thị Ánh Hồng Đặng Lê '.repeat(6).trim()
  assert.equal(greeting(render(success([profile(longName)]))), `Welcome back, ${longName}!`)
  assert.equal(greeting(render(success([profile('<script>alert(1)</script>')]))),
    'Welcome back, &lt;script&gt;alert(1)&lt;/script&gt;!')
})

test('pending, background refetch and offline-paused states never greet with the cached previous name', () => {
  const cached = [profile('Previous name')]
  for (const state of [
    { data: undefined, isPending: true, isSuccess: false, isFetching: true },
    { ...success(cached), isFetching: true, fetchStatus: 'fetching' },
    { ...success(cached), fetchStatus: 'paused' },
  ]) assert.equal(greeting(render(state)), 'Welcome back!')
  assert.match(render({ data: undefined, isPending: true, isFetching: true }), /Loading default patient profile/)
})

const appointment = (id, status = 'Pending', startTime = '10:00:00') => ({
  id, status, startTime, endTime: '12:00:00', appointmentDate: '2099-10-22',
  doctorName: 'Doctor display', departmentName: 'Department display', patientName: 'Appointment patient',
})

test('profile API errors use a neutral greeting while appointments remain usable', () => {
  const html = render({ ...success([profile('Cached name')]), isSuccess: false, isError: true },
    success([appointment('appointment-one')]))
  assert.equal(greeting(html), 'Welcome back!')
  assert.match(html, /Profile request failed/)
  assert.match(html, /Retry profiles/)
  assert.match(html, /1 upcoming appointment/)
  assert.match(html, /href="\/appointments\/appointment-one"/)
})

test('appointment summary, chronological selection and quick actions remain unchanged', () => {
  const html = render(success([profile()]), success([
    appointment('later', 'Confirmed', '11:00:00'), appointment('first'),
    ...['Completed', 'Cancelled', 'NoShow'].map((status) => appointment(status, status)),
  ]))
  assert.match(html, /2 upcoming appointments/)
  assert.match(html, /href="\/appointments\/first"/)
  assert.doesNotMatch(html, /href="\/appointments\/(later|Completed|Cancelled|NoShow)"/)
  assert.match(html, /Pending: 1/)
  assert.match(html, /Confirmed: 1/)
  for (const label of ['Book Appointment', 'My Appointments', 'Manage Profiles', 'Find Doctors']) {
    assert.ok(html.includes(label))
  }
  assert.match(render(), /You have no upcoming appointments/)
  assert.match(render(success([]), { isError: true, isPending: false }), /Appointment request failed/)
})

async function cacheScenario(initial, replacement, mutationName) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  let resolveList
  let reads = 0
  const hooks = loadSource('src/hooks/usePatientProfiles.ts', {
    '@tanstack/react-query': {
      useQuery: (options) => options, useQueryClient: () => client, useMutation: (options) => options,
    },
    '../services/patientProfilesApi': {
      patientProfilesApi: { list: () => { reads++; return new Promise((resolve) => { resolveList = resolve }) } },
    },
  })
  client.setQueryData(hooks.patientProfileKeys.all, initial)
  const observer = new QueryObserver(client, hooks.usePatientProfiles())
  const unsubscribe = observer.subscribe(() => {})
  try {
    const before = greeting(render(observer.getCurrentResult()))
    const fetched = new Promise((resolve) => {
      const off = observer.subscribe((state) => {
        if (!state.isFetching && state.isSuccess && state.isFetchedAfterMount) { off(); resolve(state) }
      })
    })
    // Exercise production invalidation callbacks without invoking any mutation function.
    hooks[mutationName]().onSuccess(replacement.find((p) => p.isDefault))
    assert.equal(greeting(render(observer.getCurrentResult())), 'Welcome back!')
    assert.equal(reads, 1, 'One existing list refetch, no duplicate greeting request')
    resolveList(replacement)
    const after = greeting(render(await fetched))
    assert.deepEqual(client.getQueryData(hooks.patientProfileKeys.all), replacement)
    return { before, after }
  } finally { unsubscribe(); observer.destroy(); client.clear() }
}

test('creating a default profile refreshes the existing cache and greeting', async () => {
  assert.deepEqual(await cacheScenario([], [profile()], 'useCreatePatientProfile'), {
    before: 'Welcome back!', after: 'Welcome back, Nguyễn Văn An!',
  })
})

test('editing or switching the default profile refreshes the greeting through existing invalidation', async () => {
  const initial = [profile(), profile('Trần Thị Bình', false, 'family-profile')]
  const edited = [profile('Nguyễn Văn An Updated'), initial[1]]
  assert.equal((await cacheScenario(initial, edited, 'useUpdatePatientProfile')).after,
    'Welcome back, Nguyễn Văn An Updated!')
  const switched = [profile('Nguyễn Văn An', false), profile('Trần Thị Bình', true, 'family-profile')]
  assert.equal((await cacheScenario(initial, switched, 'useUpdatePatientProfile')).after,
    'Welcome back, Trần Thị Bình!')
})

test('deleting the default profile removes its name and respects the returned replacement default', async () => {
  assert.deepEqual(await cacheScenario([profile()], [], 'useDeletePatientProfile'), {
    before: 'Welcome back, Nguyễn Văn An!', after: 'Welcome back!',
  })
  assert.equal((await cacheScenario([profile()], [profile('Trần Thị Bình')], 'useDeletePatientProfile')).after,
    'Welcome back, Trần Thị Bình!')
})
