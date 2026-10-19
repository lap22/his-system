const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

// Pure application rules, compiled in memory. No HTTP adapters or database writes.
function loadSource(relative, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename)
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = (name) => name.startsWith('.')
    ? loadSource(path.resolve(path.dirname(filename), name + '.ts'), cache) : originalRequire(name)
  cache.set(filename, loaded)
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename)
  return loaded.exports
}
const rules = loadSource('src/utils/myAppointments.ts')
const formatting = loadSource('src/utils/appointmentFormatting.ts')
const types = loadSource('src/types/appointment.ts')
const protection = loadSource('src/services/cancellationProtection.ts')
const now = Date.parse('2026-10-19T00:00:00Z')

test('terminal statuses belong to history even with a future appointment date', () => {
  for (const status of ['Completed', 'Cancelled', 'NoShow']) {
    assert.equal(rules.appointmentPeriod({ status, appointmentDate: '2026-10-22', endTime: '12:00:00' }, now), 'history')
  }
})
test('hospital time includes an ongoing appointment until its precise end boundary', () => {
  const appointment = { status: 'InProgress', appointmentDate: '2026-10-19', endTime: '10:30:00' }
  assert.equal(rules.appointmentPeriod(appointment, Date.parse('2026-10-19T03:29:59Z')), 'upcoming')
  assert.equal(rules.appointmentPeriod(appointment, Date.parse('2026-10-19T03:30:00Z')), 'history')
})
test('status filtering and chronological sorting do not mutate the source list', () => {
  const appointments = [
    { id: 'later', status: 'Pending', appointmentDate: '2026-10-22', startTime: '11:00:00', endTime: '11:30:00' },
    { id: 'first', status: 'Confirmed', appointmentDate: '2026-10-22', startTime: '09:00:00', endTime: '09:30:00' },
    { id: 'middle', status: 'Pending', appointmentDate: '2026-10-22', startTime: '10:00:00', endTime: '10:30:00' },
  ]
  const original = structuredClone(appointments)
  assert.deepEqual(rules.selectAppointments(appointments, 'upcoming', 'All', now).map((a) => a.id), ['first', 'middle', 'later'])
  assert.deepEqual(rules.selectAppointments(appointments, 'upcoming', 'Pending', now).map((a) => a.id), ['middle', 'later'])
  assert.deepEqual(rules.selectAppointments(appointments, 'history', 'All', Date.parse('2026-10-23T00:00:00Z')).map((a) => a.id), ['later', 'middle', 'first'])
  assert.deepEqual(appointments, original)
})
test('only the two statuses permitted by the backend are cancellation candidates', () => {
  for (const status of types.appointmentStatusSchema.options) {
    assert.equal(rules.canCancelAppointment(status), ['Pending', 'Confirmed'].includes(status))
    assert.ok(rules.appointmentStatusLabels[status])
  }
})
test('UTC SQL timestamps and explicit offsets format identically across hospital midnight', () => {
  const expected = formatting.formatAppointmentTimestamp('2026-10-18T18:30:00Z')
  assert.equal(formatting.formatAppointmentTimestamp('2026-10-18T18:30:00'), expected)
  assert.equal(formatting.formatAppointmentTimestamp('2026-10-19T01:30:00+07:00'), expected)
  assert.ok(expected.includes('19 Oct 2026') && expected.includes('01:30'))
})
test('cancellation reason matches the optional backend 1000-character limit', () => {
  assert.equal(types.cancelAppointmentRequestSchema.safeParse({ reason: null }).success, true)
  assert.equal(types.cancelAppointmentRequestSchema.safeParse({ reason: 'a'.repeat(1000) }).success, true)
  assert.equal(types.cancelAppointmentRequestSchema.safeParse({ reason: 'a'.repeat(1001) }).success, false)
})
test('unresolved cancellation protection is isolated by account and record and fails closed', () => {
  const previous = global.sessionStorage
  const store = new Map()
  global.sessionStorage = { getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) }
  try {
    assert.equal(protection.saveCancellationProtection('patient-a', 'appointment-a'), true)
    assert.equal(protection.readCancellationProtection('patient-a', 'appointment-a'), 'unresolved')
    assert.equal(protection.readCancellationProtection('patient-b', 'appointment-a'), 'clear')
    assert.equal(protection.readCancellationProtection('patient-a', 'appointment-b'), 'clear')
    assert.equal(protection.clearCancellationProtection('patient-a', 'appointment-a'), true)
    assert.equal(protection.readCancellationProtection('patient-a', 'appointment-a'), 'clear')
    global.sessionStorage = { getItem() { throw Error('Storage blocked') }, setItem() { throw Error('Storage blocked') } }
    assert.equal(protection.readCancellationProtection('patient-a', 'appointment-a'), 'unavailable')
    assert.equal(protection.saveCancellationProtection('patient-a', 'appointment-a'), false)
  } finally { global.sessionStorage = previous }
})
