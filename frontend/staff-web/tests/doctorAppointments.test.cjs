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

// Compile fresh application modules. All API/storage dependencies below are offline doubles.
function loader(overrides = {}) {
  const cache = new Map()
  function load(relative) {
    const base = path.resolve(__dirname, '..', relative)
    const file = [base, base + '.ts', base + '.tsx'].find(existsSync)
    assert.ok(file)
    if (cache.has(file)) return cache.get(file).exports
    const loaded = new Module(file)
    loaded.paths = Module._nodeModulePaths(path.dirname(file))
    const originalRequire = loaded.require.bind(loaded)
    loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.')
      ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name))) : originalRequire(name)
    cache.set(file, loaded)
    const source = readFileSync(file, 'utf8').replaceAll('import.meta.env', '({ VITE_PORTAL: "staff", VITE_API_BASE_URL: "/api" })').replaceAll('import.meta.hot', 'undefined')
    loaded._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file)
    return loaded.exports
  }
  return load
}
const userId = '11111111-1111-4111-8111-111111111111'
const doctorId = '22222222-2222-4222-8222-222222222222'
const appointmentId = '33333333-3333-4333-8333-333333333333'
const profileId = '44444444-4444-4444-8444-444444444444'
const appointment = (changes = {}) => ({ id: appointmentId, doctorId, patientProfileId: profileId,
  patientName: 'Nguyễn An', doctorName: 'Doctor Test', departmentId: userId, departmentName: 'General',
  appointmentDate: '2026-10-29', startTime: '09:00:00', endTime: '09:30:00', status: 'Pending', symptoms: null,
  createdAt: '2026-10-28T01:00:00', updatedAt: null, cancelledAt: null, cancellationReason: null, ...changes })
const rejection = status => new axios.AxiosError('Offline business rejection', '', {}, null, { status, data: {} })
const ok = data => ({ data, isSuccess: true, isPending: false, isError: false, isFetching: false, refetch() {} })
const render = (Component, props = {}, entries) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: entries }, React.createElement(Component, props)))

test('appointment DTO validates every exact backend status and nullable metadata', () => {
  const { doctorAppointmentSchema, appointmentStatusSchema } = loader()('src/types/doctorAppointments.ts')
  assert.deepEqual(appointmentStatusSchema.options, ['Pending', 'Confirmed', 'CheckedIn', 'InProgress', 'Completed', 'Cancelled', 'NoShow'])
  for (const status of appointmentStatusSchema.options) assert.equal(doctorAppointmentSchema.parse(appointment({ status })).status, status)
  for (const status of [1, 'pending', 'Waiting', 'InService']) assert.equal(doctorAppointmentSchema.safeParse(appointment({ status })).success, false)
  assert.equal(doctorAppointmentSchema.safeParse(appointment({ patientProfileId: undefined })).success, false)
})

test('hospital date and UTC metadata formatting respect Vietnam midnight', () => {
  const { hospitalClock, formatTimestamp } = loader()('src/utils/doctorAppointments.ts')
  assert.deepEqual(hospitalClock(new Date('2026-10-28T17:00:00Z')), { date: '2026-10-29', time: '00:00:00' })
  assert.equal(hospitalClock(new Date('2026-10-28T16:59:59Z')).date, '2026-10-28')
  assert.equal(formatTimestamp('2026-10-28T17:00:00'), formatTimestamp('2026-10-28T17:00:00Z'))
  assert.match(formatTimestamp('2026-10-28T17:00:00Z'), /29 Oct 2026/)
})

test('dashboard counts today only and excludes terminal/past slots from upcoming', () => {
  const { dashboardSummary } = loader()('src/utils/doctorAppointments.ts')
  const rows = [appointment({ startTime: '07:00:00' }), appointment({ status: 'Confirmed' }),
    appointment({ status: 'Completed' }), appointment({ status: 'Cancelled' }), appointment({ status: 'NoShow' }),
    appointment({ appointmentDate: '2026-10-30', status: 'Confirmed' })]
  const result = dashboardSummary(rows, new Date('2026-10-29T01:00:00Z'))
  assert.equal(result.total, 5); assert.equal(result.pending, 1); assert.equal(result.confirmed, 1); assert.equal(result.completed, 1)
  assert.equal(result.upcoming.length, 2)
  assert.deepEqual(result.upcoming.map(row => row.appointmentDate), ['2026-10-29', '2026-10-30'])
})

test('URL date/status parameters reject invalid values and duplicates', () => {
  const { parseAppointmentFilters } = loader()('src/utils/doctorAppointments.ts')
  assert.deepEqual(parseAppointmentFilters(new URLSearchParams('date=2026-10-29&status=Pending')), { date: '2026-10-29', status: 'Pending' })
  for (const text of ['date=2026-02-30', 'date=invalid', 'status=pending', 'date=2026-10-29&date=2026-10-30', 'status=Pending&status=Confirmed']) assert.equal(parseAppointmentFilters(new URLSearchParams(text)), null)
})

test('list sends validated filters and abort signal, preserving backend order', async () => {
  let call
  const rows = [appointment({ id: profileId }), appointment()]
  const load = loader({ './apiClient': { apiClient: { get: async (...args) => { call = args; return { data: rows } } } } })
  const signal = new AbortController().signal
  const actual = await load('src/services/doctorAppointmentsApi.ts').doctorAppointmentsApi.list(doctorId, { status: 'Pending' }, signal)
  assert.deepEqual(actual.map(row => row.id), rows.map(row => row.id))
  assert.equal(call[0], '/Appointments'); assert.equal(call[1].params.status, 'Pending'); assert.equal(call[1].signal, signal)
})

test('list rejects foreign Doctor data and response filter mismatch', async () => {
  let rows = [appointment({ doctorId: userId })]
  const load = loader({ './apiClient': { apiClient: { get: async () => ({ data: rows }) } } })
  const api = load('src/services/doctorAppointmentsApi.ts').doctorAppointmentsApi
  await assert.rejects(api.list(doctorId, {}))
  rows = [appointment({ status: 'Completed' })]
  await assert.rejects(api.list(doctorId, { status: 'Pending' }))
})

test('detail rejects invalid IDs before HTTP and mismatched appointment/Doctor identities', async () => {
  let calls = 0, row = appointment()
  const load = loader({ './apiClient': { apiClient: { get: async () => { calls++; return { data: row } } } } })
  const api = load('src/services/doctorAppointmentsApi.ts').doctorAppointmentsApi
  await assert.rejects(api.detail(doctorId, '123')); assert.equal(calls, 0)
  assert.equal((await api.detail(doctorId, appointmentId)).patientProfileId, profileId)
  row = appointment({ doctorId: userId }); await assert.rejects(api.detail(doctorId, appointmentId))
  row = appointment({ id: profileId }); await assert.rejects(api.detail(doctorId, appointmentId))
})

test('confirmation sends no DTO, uses skipAuthRetry and validates real response identity', async () => {
  let calls = 0, call, row = appointment({ status: 'Confirmed' })
  const load = loader({ './apiClient': { apiClient: { patch: async (...args) => { calls++; call = args; return { data: row, status: 200 } } } } })
  const api = load('src/services/doctorAppointmentsApi.ts').doctorAppointmentsApi
  assert.equal((await api.confirm(appointment())).status, 'Confirmed')
  assert.deepEqual(call, [`/Appointments/${appointmentId}/confirm`, undefined, { skipAuthRetry: true }])
  await assert.rejects(api.confirm(appointment({ status: 'Completed' }))); assert.equal(calls, 1)
  row = appointment({ status: 'Confirmed', patientProfileId: userId }); await assert.rejects(api.confirm(appointment()))
})

test('HTTP rejection messages distinguish 400,401,403,404,409; network and 5xx remain uncertain', () => {
  const { confirmationError, appointmentReadError } = loader()('src/services/doctorAppointmentsApi.ts')
  const texts = [400, 401, 403, 404, 409].map(status => { const e = confirmationError(rejection(status)); assert.equal(e.definitive, true); return e.message })
  assert.equal(new Set(texts).size, 5)
  assert.equal(confirmationError(rejection(500)).definitive, false)
  assert.equal(confirmationError(new Error()).definitive, false)
  assert.match(appointmentReadError(rejection(404)), /not assigned/)
})

function controllerFixture(options = {}) {
  const load = loader()
  const { createConfirmationController } = load('src/services/confirmationController.ts')
  let marker = options.marker ?? null
  const counts = { patches: 0, gets: 0, updates: 0 }
  let active = true
  const deps = { userId, doctorId, id: appointmentId,
    storage: { read: () => marker, write: value => { marker = value }, remove: () => { marker = null } },
    active: () => active,
    confirm: async row => { counts.patches++; return options.confirm ? options.confirm(row) : appointment({ status: 'Confirmed' }) },
    read: async () => { counts.gets++; return options.read ? options.read() : appointment({ status: 'Confirmed' }) },
    update: () => { counts.updates++ },
  }
  return { create: () => createConfirmationController(deps), counts, get marker() { return marker }, deactivate: () => { active = false }, deps }
}

test('duplicate submissions synchronously lock; success cannot replay a stale Pending snapshot', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const fixture = controllerFixture({ confirm: () => pending })
  const controller = fixture.create()
  const first = controller.submit(appointment())
  await controller.submit(appointment())
  assert.equal(fixture.counts.patches, 1); assert.equal(controller.getSnapshot().phase, 'pending')
  assert.ok(fixture.marker)
  release(appointment({ status: 'Confirmed' })); await first
  await controller.submit(appointment())
  assert.equal(fixture.counts.patches, 1); assert.equal(controller.getSnapshot().phase, 'success'); assert.equal(fixture.marker, null)
})

test('only Pending owned snapshots may initiate confirmation', async () => {
  const fixture = controllerFixture(); const controller = fixture.create()
  for (const changes of [{ status: 'Completed' }, { status: 'Confirmed' }, { doctorId: userId }, { id: profileId }]) await controller.submit(appointment(changes))
  assert.equal(fixture.counts.patches, 0)
})

test('uncertain response reconciles through GET exactly once without retrying PATCH', async () => {
  const fixture = controllerFixture({ confirm: async () => { throw new axios.AxiosError('Offline network') } })
  const controller = fixture.create(); await controller.submit(appointment())
  assert.equal(fixture.counts.patches, 1); assert.equal(fixture.counts.gets, 1); assert.equal(fixture.counts.updates, 1)
  assert.equal(controller.getSnapshot().appointment.status, 'Confirmed'); assert.equal(controller.getSnapshot().phase, 'success')
})

test('Pending after an uncertain outcome stays protected across a reconstructed controller', async () => {
  const fixture = controllerFixture({ confirm: async () => { throw Error('Offline') }, read: async () => appointment() })
  const first = fixture.create(); await first.submit(appointment())
  assert.equal(first.getSnapshot().phase, 'unresolved'); assert.ok(fixture.marker)
  const reloaded = fixture.create(); assert.equal(reloaded.getSnapshot().phase, 'unresolved')
  await reloaded.submit(appointment()); assert.equal(fixture.counts.patches, 1)
  await reloaded.verify(); assert.equal(reloaded.getSnapshot().phase, 'unresolved'); assert.equal(fixture.counts.patches, 1)
})

test('failed or foreign reconciliation cannot clear unresolved protection', async () => {
  for (const read of [async () => { throw Error('Offline') }, async () => appointment({ doctorId: userId })]) {
    const fixture = controllerFixture({ confirm: async () => { throw Error('Offline') }, read })
    const controller = fixture.create(); await controller.submit(appointment())
    assert.equal(controller.getSnapshot().phase, 'unresolved'); assert.ok(fixture.marker)
  }
})

test('delayed confirmation becomes visible through later GET without another PATCH', async () => {
  let current = appointment()
  const fixture = controllerFixture({ confirm: async () => { throw Error('Offline interruption') }, read: async () => current })
  const first = fixture.create(); await first.submit(appointment())
  assert.equal(first.getSnapshot().phase, 'unresolved')
  const reloaded = fixture.create()
  current = appointment({ status: 'Confirmed' })
  await reloaded.verify()
  assert.equal(reloaded.getSnapshot().phase, 'success'); assert.equal(fixture.marker, null)
  assert.equal(fixture.counts.patches, 1); assert.equal(fixture.counts.gets, 2)
})

test('business rejection refreshes actual status before permitting an explicit new attempt', async () => {
  const fixture = controllerFixture({ confirm: async () => { throw rejection(409) }, read: async () => appointment() })
  const controller = fixture.create(); await controller.submit(appointment())
  assert.equal(fixture.counts.gets, 1); assert.equal(controller.getSnapshot().phase, 'error'); assert.equal(fixture.marker, null)
})

test('account change prevents late confirmation results from updating another account cache', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const fixture = controllerFixture({ confirm: () => pending }); const controller = fixture.create()
  const result = controller.submit(appointment()); fixture.deactivate(); release(appointment({ status: 'Confirmed' })); await result
  assert.equal(fixture.counts.updates, 0); assert.ok(fixture.marker)
  await controller.verify(); assert.equal(fixture.counts.gets, 0)
})

test('unavailable storage prevents sending a confirmation', async () => {
  const fixture = controllerFixture(); fixture.deps.storage.write = () => { throw Error('Offline storage disabled') }
  const controller = fixture.create(); await controller.submit(appointment())
  assert.equal(fixture.counts.patches, 0); assert.equal(controller.getSnapshot().phase, 'unresolved')
})

test('schedule uses Doctor.Id, returns inactive rows and validates string DayOfWeek', async () => {
  let call
  const schedule = { id: appointmentId, doctorId, doctorName: 'Doctor Test', dayOfWeek: 'Thursday', startTime: '09:00:00', endTime: '12:00:00', slotDurationMinutes: 30, maxPatients: 6, isActive: false }
  const load = loader({ './apiClient': { apiClient: { get: async (...args) => { call = args; return { data: [schedule] } } } } })
  const signal = new AbortController().signal
  const rows = await load('src/services/doctorSchedulesApi.ts').getDoctorSchedules(doctorId, signal)
  assert.deepEqual(call, ['/doctor-schedules', { params: { doctorId }, signal }]); assert.notEqual(call[1].params.doctorId, userId)
  assert.equal(rows[0].isActive, false)
  const schema = load('src/types/doctorAppointments.ts').doctorScheduleSchema
  assert.equal(schema.safeParse({ ...schedule, dayOfWeek: 4 }).success, false)
  schedule.doctorId = userId
  await assert.rejects(load('src/services/doctorSchedulesApi.ts').getDoctorSchedules(doctorId))
})

test('appointment/detail/schedule query keys include both account and Doctor identity', () => {
  let user = { userId, role: 'Doctor' }, doctor = { id: doctorId }
  const load = loader({ './useAuth': { useAuth: () => ({ user, status: 'authenticated' }) }, './useCurrentDoctor': { useCurrentDoctor: () => ({ isSuccess: true, data: doctor }) },
    '@tanstack/react-query': { useQuery: options => options } })
  const hooks = load('src/hooks/useDoctorAppointments.ts')
  const a = hooks.useDoctorAppointments({ date: '2026-10-29' })
  assert.equal(a.queryKey[1], userId); assert.equal(a.queryKey[2], doctorId)
  assert.equal(hooks.useDoctorAppointmentDetail('bad').enabled, false)
  assert.equal(hooks.useDoctorAppointments(null).enabled, false)
  user = { userId: profileId, role: 'Admin' }; doctor = { id: appointmentId }
  assert.notDeepEqual(a.queryKey, hooks.useDoctorAppointments({ date: '2026-10-29' }).queryKey)
  assert.equal(hooks.useDoctorSchedules().enabled, false)
})

test('confirmation hook updates exact detail and invalidates list/dashboard caches', async () => {
  const client = new QueryClient(); const invalidated = []
  const invalidate = client.invalidateQueries.bind(client)
  client.invalidateQueries = async options => { invalidated.push(options); await invalidate(options) }
  const load = loader({ react: { ...React, useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    '@tanstack/react-query': { useQueryClient: () => client }, './useAuth': { useAuth: () => ({ user: { userId, role: 'Doctor' } }) },
    './useCurrentDoctor': { useCurrentDoctor: () => ({ data: { id: doctorId } }) },
    '../services/doctorAppointmentsApi': { doctorAppointmentsApi: { confirm: async () => appointment({ status: 'Confirmed' }) } } })
  const auth = load('src/services/authSession.ts').authSession
  auth.setSession({ userId, role: 'Doctor' })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const map = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) } })
  try {
    const confirmation = load('src/hooks/useConfirmAppointment.ts').useConfirmAppointment(appointmentId)
    await confirmation.submit(appointment())
    assert.deepEqual(invalidated.map(options => options.queryKey), [
      ['doctorAppointments', userId, doctorId, 'detail', appointmentId], ['doctorAppointments', userId, doctorId, 'list'],
    ])
    assert.equal(invalidated[0].refetchType, 'none')
    assert.equal(client.getQueryData(['doctorAppointments', userId, doctorId, 'detail', appointmentId]).status, 'Confirmed')
    assert.equal(client.getQueryState(['doctorAppointments', userId, doctorId, 'detail', appointmentId]).isInvalidated, true)
    assert.equal(map.size, 0)
  } finally { client.clear(); if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage }
})

test('dashboard/list loading, empty and error states never fabricate metrics', () => {
  let query = ok([])
  const load = loader({ '../hooks/useDoctorAppointments': { useDoctorAppointments: () => query }, '../hooks/useCurrentDoctor': { useCurrentDoctor: () => ({ data: { fullName: 'Doctor Test' } }) } })
  const Dashboard = load('src/pages/DoctorDashboard.tsx').DoctorDashboard
  assert.match(render(Dashboard), /No appointments today/)
  query = { ...ok([]), isSuccess: false, isPending: true }
  assert.match(render(Dashboard), /Loading appointment information/); assert.doesNotMatch(render(Dashboard), /Completed today/)
  query = { ...ok([]), isSuccess: false, isError: true, error: Error('Offline') }
  assert.match(render(Dashboard), /could not be verified/); assert.doesNotMatch(render(Dashboard), /Completed today/)
  const List = load('src/components/DoctorAppointments.tsx').DoctorAppointmentList
  assert.match(render(List, { rows: [] }), /No appointments match/)
  assert.match(render(List, { rows: [appointment()] }), /Nguyễn An/)
})

test('list filters remain in URLs; invalid filters block the query and explain recovery', () => {
  let received
  const load = loader({ '../hooks/useDoctorAppointments': { useDoctorAppointments: filters => { received = filters; return ok([]) } } })
  const Page = load('src/pages/DoctorAppointmentsPage.tsx').DoctorAppointmentsPage
  const html = render(Page, {}, ['/doctor/appointments?date=2026-10-29&status=Pending'])
  assert.deepEqual(received, { date: '2026-10-29', status: 'Pending' }); assert.match(html, /2026-10-29/)
  assert.match(render(Page, {}, ['/doctor/appointments?status=bad']), /Invalid date or status/); assert.equal(received, null)
})

test('invalid detail route makes no query; only Pending detail renders Confirm action', () => {
  let id = 'bad', query = ok(appointment()), queries = 0
  const router = require('react-router-dom')
  const load = loader({ 'react-router-dom': { ...router, useParams: () => ({ id }) },
    '../hooks/useDoctorAppointments': { useDoctorAppointmentDetail: () => { queries++; return query } },
    '../hooks/useConfirmAppointment': { useConfirmAppointment: () => ({ phase: 'idle', message: '', submit() {}, verify() {} }) } })
  const Page = load('src/pages/DoctorAppointmentDetailsPage.tsx').DoctorAppointmentDetailsPage
  assert.match(render(Page), /Invalid appointment identifier/); assert.equal(queries, 0)
  id = appointmentId; assert.match(render(Page), /Confirm appointment/)
  query = ok(appointment({ status: 'Completed' })); assert.doesNotMatch(render(Page), />Confirm appointment</)
  query = { ...ok([]), isSuccess: false, isError: true, error: rejection(404) }
  assert.match(render(Page), /not assigned/); assert.doesNotMatch(render(Page), /Nguyễn An/)
})

test('schedule renders weekdays/inactive state with no editing actions', () => {
  let query = ok([{ id: appointmentId, dayOfWeek: 'Thursday', startTime: '09:00:00', endTime: '12:00:00', slotDurationMinutes: 30, maxPatients: 6, isActive: false }])
  const load = loader({ '../hooks/useDoctorAppointments': { useDoctorSchedules: () => query },
    '../hooks/useCurrentDoctor': { useCurrentDoctor: () => ({ data: { fullName: 'Doctor Test', departmentName: 'General' } }) } })
  const Page = load('src/pages/DoctorSchedulePage.tsx').DoctorSchedulePage
  const html = render(Page)
  assert.match(html, /Thursday/); assert.match(html, /Inactive/); assert.match(html, /Maximum patients: 6/)
  assert.doesNotMatch(html, />Edit<|>Delete<|>Create</)
  query = ok([]); assert.match(render(Page), /No schedules are configured/)
})
