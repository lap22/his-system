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
  const loaded = new Module(file)
  loaded.paths = Module._nodeModulePaths(path.dirname(file))
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.')
    ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)), overrides, cache)
    : originalRequire(name)
  cache.set(file, loaded)
  loaded._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file)
  return loaded.exports
}

const profileA = '11111111-1111-4111-8111-111111111111'
const profileB = '22222222-2222-4222-8222-222222222222'
const record = profileId => ({
  id: '33333333-3333-4333-8333-333333333333', appointmentId: '44444444-4444-4444-8444-444444444444',
  patientProfileId: profileId, doctorId: '55555555-5555-4555-8555-555555555555', chiefComplaint: 'Concern',
  symptoms: null, diagnosis: 'Diagnosis', treatment: null, doctorNotes: null, status: 'Finalized',
  rowVersion: 'AAAAAAAAAAA=', createdAt: '2026-11-07T01:00:00Z', updatedAt: null,
  finalizedAt: '2026-11-07T02:00:00Z', finalizedByUserId: '66666666-6666-4666-8666-666666666666',
})

function service(data, enabled = true) {
  const calls = []
  const module = load('src/services/medicalRecordsApi.ts', {
    './apiClient': { apiClient: { get: async (...args) => { calls.push(args); return { data } } } },
    './clinicalFeature': { requireClinicalApiEnabled: () => { if (!enabled) throw new Error('CLINICAL_API_DISABLED') } },
  })
  return { ...module, calls }
}

test('disabled feature gate makes no patient clinical request', async () => {
  const api = service([], false)
  await assert.rejects(api.medicalRecordsApi.forPatientProfile(profileA), /CLINICAL_API_DISABLED/)
  assert.equal(api.calls.length, 0)
})

test('profile requests use exact scoped endpoint and preserve cache isolation inputs', async () => {
  const apiA = service([record(profileA)])
  assert.equal((await apiA.medicalRecordsApi.forPatientProfile(profileA))[0].patientProfileId, profileA)
  assert.equal(apiA.calls[0][0], `/MedicalRecords/patient-profile/${profileA}`)
  const keys = load('src/utils/medicalHistory.ts').medicalHistoryKeys
  assert.notDeepEqual(keys.profile('account', profileA), keys.profile('account', profileB))
})

test('Draft records and cross-profile records fail closed without display', async () => {
  const draft = { ...record(profileA), status: 'Draft', finalizedAt: null, finalizedByUserId: null }
  await assert.rejects(service([draft]).medicalRecordsApi.forPatientProfile(profileA))
  await assert.rejects(service([record(profileB)]).medicalRecordsApi.forPatientProfile(profileA), /ownership/)
})

test('patient authorization errors are user-friendly and clinical content is never stored or logged', () => {
  const api = service([])
  for (const [status, phrase] of [[401, 'expired'], [403, 'Patient'], [404, 'belong']]) {
    assert.match(api.medicalHistoryError({ isAxiosError: true, response: { status } }), new RegExp(phrase, 'i'))
  }
  const source = ['src/services/medicalRecordsApi.ts', 'src/hooks/useMedicalHistory.ts']
    .map(file => readFileSync(path.resolve(__dirname, '..', file), 'utf8')).join('\n')
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./)
  assert.match(source, /retry: false/)
})
