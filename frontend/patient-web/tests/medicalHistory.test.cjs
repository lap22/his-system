const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')

function loadSource(relative, overrides = {}, cache = new Map()) {
  const base = path.resolve(__dirname, '..', relative)
  const filename = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
  assert.ok(filename, `Application module resolves: ${relative}`)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename)
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = (name) => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.')
    ? loadSource(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name)), overrides, cache)
    : originalRequire(name)
  cache.set(filename, loaded)
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename)
  return loaded.exports
}

const routerSource = readFileSync(path.resolve(__dirname, '../src/routes/router.tsx'), 'utf8')
const layoutSource = readFileSync(path.resolve(__dirname, '../src/layouts/AppLayout.tsx'), 'utf8')
const pageSource = readFileSync(path.resolve(__dirname, '../src/pages/MedicalHistoryPage.tsx'), 'utf8')
const portalSource = readFileSync(path.resolve(__dirname, '../src/services/portal.ts'), 'utf8')
const schemas = loadSource('src/types/medicalHistory.ts')
const rules = loadSource('src/utils/medicalHistory.ts')
const profile = (id, fullName, isDefault = false) => ({ id, fullName, isDefault, relationship: 'Self' })
const success = (data) => ({ data, isPending: false, isError: false, isFetching: false, refetch() {} })
let profileQuery = success([])
let authUserId = '11111111-1111-4111-8111-111111111111'
const { MedicalHistoryPage } = loadSource('src/pages/MedicalHistoryPage.tsx', {
  '../hooks/usePatientProfiles': { usePatientProfiles: () => profileQuery },
  '../hooks/useAuth': { useAuth: () => ({ user: { userId: authUserId, role: 'Patient' } }) },
  '../services/patientProfilesApi': { profileErrorMessage: () => 'Profile request failed' },
})
function render(query = success([])) {
  profileQuery = query
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(MedicalHistoryPage)))
}
const record = (changes = {}) => ({
  id: '22222222-2222-4222-8222-222222222222', appointmentId: '33333333-3333-4333-8333-333333333333',
  patientProfileId: '44444444-4444-4444-8444-444444444444', doctorId: '55555555-5555-4555-8555-555555555555',
  chiefComplaint: null, symptoms: null, diagnosis: 'Diagnosis', treatment: null, doctorNotes: null,
  status: 'Finalized', rowVersion: 'AAAAAAAAAAA=', createdAt: '2026-11-06T01:00:00Z', updatedAt: null,
  finalizedAt: '2026-11-06T02:00:00Z', finalizedByUserId: '66666666-6666-4666-8666-666666666666', ...changes,
})

test('Medical History route is nested under the existing protected Patient boundary', () => {
  assert.match(routerSource, /element: <AuthBoundary \/>.*path: 'medical-history'/s)
})
test('anonymous access uses the existing protected-boundary login redirect', () => {
  const source = readFileSync(path.resolve(__dirname, '../src/components/AuthBoundary.tsx'), 'utf8')
  assert.match(source, /<Navigate to="\/login"/)
})
test('Doctor and Admin roles remain denied by the Patient portal role allowlist', () => {
  assert.match(portalSource, /roles: \['Patient'\]/)
  assert.doesNotMatch(portalSource, /roles: \[[^\]]*(Doctor|Admin)/)
})
test('navigation exposes the bilingual Medical History entry', () => {
  assert.match(layoutSource, /to="\/medical-history"/); assert.match(layoutSource, /Medical History \/ Hồ sơ bệnh án/)
})
test('default profile selection uses real profile IDs', () => {
  const profiles = [profile('family-id', 'Family'), profile('default-id', 'Default', true)]
  assert.equal(rules.nextOwnedProfileId('', profiles), 'default-id')
})
test('profile switching preserves an owned current selection', () => {
  const profiles = [profile('a', 'A'), profile('b', 'B')]
  assert.equal(rules.nextOwnedProfileId('b', profiles), 'b')
})
test('deleted and invalid profile selections fail to an existing owned profile, never All', () => {
  assert.equal(rules.nextOwnedProfileId('deleted', [profile('owned', 'Owned')]), 'owned')
  assert.equal(rules.nextOwnedProfileId('foreign', []), '')
})
test('future cache keys isolate account and PatientProfile identities', () => {
  assert.notDeepEqual(rules.medicalHistoryKeys.profile('account-a', 'profile'), rules.medicalHistoryKeys.profile('account-b', 'profile'))
  assert.notDeepEqual(rules.medicalHistoryKeys.profile('account', 'profile-a'), rules.medicalHistoryKeys.profile('account', 'profile-b'))
})
test('empty profile and medical-history states are explicit', () => {
  const html = render(success([])); assert.match(html, /Add a Patient Profile/); assert.match(html, /No electronic medical records are available/)
})
test('runtime page fabricates no medical records', () => {
  const html = render(success([profile('owned', 'Nguyễn An', true)]))
  assert.match(html, /Electronic medical records are not yet available/)
  assert.doesNotMatch(pageSource, /<MedicalRecordDetail|records\.map/)
})
test('Appointment History is clearly separate from clinical history', () => {
  const html = render(success([])); assert.match(html, /Open Appointment History/); assert.match(html, /separate from finalized clinical records/)
})
test('patient schema accepts Finalized records only and rejects Draft', () => {
  assert.equal(schemas.patientMedicalRecordSchema.safeParse(record()).success, true)
  assert.equal(schemas.patientMedicalRecordSchema.safeParse(record({ status: 'Draft' })).success, false)
})
test('invalid PatientProfile IDs are rejected by the future response contract', () => {
  assert.equal(schemas.patientMedicalRecordSchema.safeParse(record({ patientProfileId: 'account-user-id' })).success, false)
})
test('nullable clinical fields are rendered with clear unavailable presentation', () => {
  const { MedicalRecordDetail } = loadSource('src/components/medicalHistory/MedicalRecordDetail.tsx')
  const html = renderToStaticMarkup(React.createElement(MedicalRecordDetail, { record: record(), patientName: 'Nguyễn An' }))
  assert.match(html, /Not available/); assert.match(html, /Diagnosis/); assert.match(html, /Doctor notes and prescriptions are not displayed/)
})
test('record list and detail use responsive minmax grids', () => {
  const detail = readFileSync(path.resolve(__dirname, '../src/components/medicalHistory/MedicalRecordDetail.tsx'), 'utf8')
  assert.match(pageSource, /minmax\(0, 1fr\)/); assert.match(detail, /minmax\(0, 1fr\)/)
})
test('profile selection and navigation retain native keyboard-accessible controls', () => {
  assert.match(pageSource, /<Select/); assert.match(pageSource, /<Button component=\{Link\}/); assert.match(pageSource, /aria-live="polite"/)
})
test('Medical History source contains no clinical API request or query hook', () => {
  assert.doesNotMatch(pageSource, /apiClient|axios|\bfetch\(|useQuery|medicalRecordsApi/)
})
test('clinical content is never persisted in browser storage or logged', () => {
  const combined = pageSource + readFileSync(path.resolve(__dirname, '../src/components/medicalHistory/MedicalRecordDetail.tsx'), 'utf8')
  assert.doesNotMatch(combined, /localStorage|sessionStorage|console\./)
})
