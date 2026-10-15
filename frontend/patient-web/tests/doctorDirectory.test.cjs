const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const axios = require('axios')
const { z } = require('zod')

// Compile the application modules in memory; no build artifacts or packages needed.
function loadSource(relative, overrides = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename)
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name]
    if (name.startsWith('.')) return loadSource(path.resolve(path.dirname(filename), name + '.ts'), overrides, cache)
    return originalRequire(name)
  }
  cache.set(filename, loaded)
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename)
  return loaded.exports
}

const { searchDoctors } = loadSource('src/utils/doctorDirectory.ts')
const { doctorSchema } = loadSource('src/types/doctorDirectory.ts')
const { appointmentSlotSchema } = loadSource('src/types/appointmentAvailability.ts')

test('search matches name or specialization, ignores case and Vietnamese accents', () => {
  const doctors = [
    { fullName: 'Nguy\u1ec5n An', specialization: 'Cardiology', isActive: true },
    { fullName: 'Tran Binh', specialization: 'Neurology', isActive: true },
    { fullName: 'Inactive', specialization: 'Cardiology', isActive: false },
  ]
  assert.equal(searchDoctors(doctors, '  NGUYEN  ')[0].fullName, doctors[0].fullName)
  assert.equal(searchDoctors(doctors, 'cardio').length, 1)
  assert.equal(searchDoctors(doctors, '').length, 2)
  assert.deepEqual(searchDoctors(doctors, 'no matching doctor'), [])
  assert.deepEqual(searchDoctors([], ''), [])
})

test('schemas support SQL timestamps and TimeOnly precision and reject malformed values', () => {
  assert.equal(doctorSchema.shape.createdAt.safeParse('2026-10-14T08:30:00.1234567').success, true)
  assert.equal(doctorSchema.shape.createdAt.safeParse('2026-10-14T08:30:00Z').success, true)
  assert.equal(doctorSchema.shape.createdAt.safeParse('not-a-date').success, false)
  assert.equal(appointmentSlotSchema.shape.startTime.safeParse('08:30:00.1234567').success, true)
  assert.equal(appointmentSlotSchema.shape.reason.safeParse('Completed').success, true)
  assert.equal(appointmentSlotSchema.shape.reason.safeParse(1).success, false)
})

test('API requests use the real paths and server-side filters and unwrap arrays', async () => {
  const requests = []
  const apiClient = axios.create({ adapter: async (config) => {
    requests.push(config)
    return { config, status: 200, statusText: 'OK', headers: {}, data: [] }
  } })
  const { doctorDirectoryApi } = loadSource('src/services/doctorDirectoryApi.ts', { './apiClient': { apiClient } })
  assert.deepEqual(await doctorDirectoryApi.departments(), [])
  assert.deepEqual(await doctorDirectoryApi.doctors('department-id'), [])
  assert.deepEqual(await doctorDirectoryApi.doctors(''), [])
  assert.deepEqual(await doctorDirectoryApi.availableSlots('doctor-id', '2026-10-14'), [])
  assert.equal(requests[0].url, '/departments')
  assert.deepEqual(requests[1].params, { isActive: true, departmentId: 'department-id' })
  assert.deepEqual(requests[2].params, { isActive: true })
  assert.equal(requests[3].url, '/doctors/doctor-id/available-slots')
  assert.deepEqual(requests[3].params, { date: '2026-10-14' })
})

test('error messages distinguish authorization, network and response contract failures', () => {
  const { directoryErrorMessage } = loadSource('src/services/doctorDirectoryApi.ts', { './apiClient': { apiClient: {} } })
  const error = (status, data) => new axios.AxiosError('Request failed', undefined, undefined, undefined, { status, data })
  assert.match(directoryErrorMessage(error(401, {}), 'doctors'), /sign in/)
  assert.match(directoryErrorMessage(error(403, {}), 'working hours'), /permission/)
  assert.match(directoryErrorMessage(error(404, {}), 'doctor details'), /no longer available/)
  assert.equal(directoryErrorMessage(error(500, { message: 'An unexpected error occurred.' }), 'doctors'), 'An unexpected error occurred.')
  assert.match(directoryErrorMessage(new axios.AxiosError('Network error'), 'doctors'), /Unable to reach/)
  assert.match(directoryErrorMessage(z.array(doctorSchema).safeParse({ doctors: [] }).error, 'doctors'), /unexpected response/)
})

test('hospital calendar dates follow UTC+7 across the midnight boundary', () => {
  const { hospitalToday } = loadSource('src/utils/appointmentAvailability.ts')
  assert.equal(hospitalToday(new Date('2026-10-14T16:59:59Z')), '2026-10-14')
  assert.equal(hospitalToday(new Date('2026-10-14T17:00:00Z')), '2026-10-15')
})

test('selection is valid only when the latest API boolean allows the identical interval', () => {
  const { availableSelection, slotKey } = loadSource('src/utils/appointmentAvailability.ts')
  const slot = { startTime: '09:00:00', endTime: '09:30:00', isAvailable: true, reason: 'Available' }
  const key = slotKey(slot)
  assert.deepEqual(availableSelection([slot], key), slot)
  for (const reason of ['Completed', 'Full', 'Past', 'Inactive', 'Available']) {
    assert.equal(availableSelection([{ ...slot, isAvailable: false, reason }], key), null)
  }
  assert.equal(availableSelection([{ ...slot, endTime: '09:45:00' }], key), null)
  assert.equal(availableSelection([], key), null)
  assert.equal(availableSelection(undefined, key), null)
  assert.equal(availableSelection([slot], null), null)
})

test('unavailable buttons use native disabling and muted CSS including hover', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { AppointmentSlotButton } = loadSource('src/components/doctors/AppointmentSlotButton.tsx')
  for (const reason of ['Completed', 'Full', 'Past', 'Inactive']) {
    const html = renderToStaticMarkup(React.createElement(AppointmentSlotButton, {
      slot: { startTime: '09:00:00', endTime: '09:30:00', isAvailable: false, reason },
      selected: false, refreshing: false, onSelect: () => assert.fail('Unavailable slot selected'),
    }))
    assert.match(html, /<button[^>]*disabled=""/)
    assert.match(html, /tabindex="-1"/)
    assert.match(html, new RegExp('aria-label="09:00 - 09:30, ' + reason + '"'))
    assert.match(html, /\.Mui-disabled:hover\{background-color:#eceff1/)
    assert.match(html, /cursor:default;pointer-events:none/)
    assert.match(html, /aria-pressed="false"/)
  }
})

test('available selection is highlighted and refresh prevents interaction', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { AppointmentSlotButton } = loadSource('src/components/doctors/AppointmentSlotButton.tsx')
  const props = { slot: { startTime: '09:00:00', endTime: '09:30:00', isAvailable: true, reason: 'Available' }, selected: true, refreshing: false, onSelect: () => {} }
  const html = renderToStaticMarkup(React.createElement(AppointmentSlotButton, props))
  assert.doesNotMatch(html, /<button[^>]*disabled=""/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /MuiButton-contained/)
  assert.match(html, />Selected<\/span>/)
  const refreshing = renderToStaticMarkup(React.createElement(AppointmentSlotButton, { ...props, refreshing: true }))
  assert.match(refreshing, /<button[^>]*disabled=""/)
})
