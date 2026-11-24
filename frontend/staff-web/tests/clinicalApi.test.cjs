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

const appointmentId = '11111111-1111-4111-8111-111111111111'
const recordId = '22222222-2222-4222-8222-222222222222'
const profileId = '33333333-3333-4333-8333-333333333333'
const doctorId = '44444444-4444-4444-8444-444444444444'
const actorId = '55555555-5555-4555-8555-555555555555'
const version = 'AAAAAAAAAAA='
const draft = { chiefComplaint: ' Concern ', symptoms: '', diagnosis: ' Dx ', treatment: '', doctorNotes: '' }
const response = (status = 'Draft') => ({ id: recordId, appointmentId, patientProfileId: profileId, doctorId,
  chiefComplaint: 'Concern', symptoms: null, diagnosis: 'Dx', treatment: null, doctorNotes: null,
  status, rowVersion: version, createdAt: '2026-11-07T01:00:00Z', updatedAt: null,
  finalizedAt: status === 'Finalized' ? '2026-11-07T02:00:00Z' : null,
  finalizedByUserId: status === 'Finalized' ? actorId : null })

function service(enabled = true) {
  const calls = []
  const apiClient = {
    get: async (...args) => { calls.push(['get', ...args]); return { data: response() } },
    post: async (url, body, options) => { calls.push(['post', url, body, options]); return { data: response(url.endsWith('/finalize') ? 'Finalized' : 'Draft') } },
    put: async (...args) => { calls.push(['put', ...args]); return { data: response() } },
  }
  const module = load('src/services/medicalRecordsApi.ts', {
    './apiClient': { apiClient },
    './clinicalFeature': { requireClinicalApiEnabled: () => { if (!enabled) throw new Error('CLINICAL_API_DISABLED') } },
  })
  return { ...module, calls }
}

test('disabled feature gate prevents every clinical endpoint request', async () => {
  const api = service(false)
  await assert.rejects(api.medicalRecordsApi.byAppointment(appointmentId), /CLINICAL_API_DISABLED/)
  await assert.rejects(api.medicalRecordsApi.create(appointmentId, draft), /CLINICAL_API_DISABLED/)
  assert.equal(api.calls.length, 0)
})

test('Doctor load and Save Draft use exact contracts with no mutation replay', async () => {
  const api = service()
  assert.equal((await api.medicalRecordsApi.byAppointment(appointmentId)).id, recordId)
  await api.medicalRecordsApi.create(appointmentId, draft)
  await api.medicalRecordsApi.update(recordId, version, draft)
  assert.deepEqual(api.calls.map(call => [call[0], call[1]]), [
    ['get', `/MedicalRecords/appointment/${appointmentId}`], ['post', '/MedicalRecords'],
    ['put', `/MedicalRecords/${recordId}/draft`],
  ])
  assert.equal(api.calls[1][2].chiefComplaint, 'Concern')
  assert.equal(api.calls[1][2].symptoms, null)
  assert.equal(api.calls[1][3].skipAuthRetry, true)
  assert.equal(api.calls[2][2].rowVersion, version)
})

test('Finalize carries the current RowVersion and validates finalization fields', async () => {
  const api = service()
  const finalized = await api.medicalRecordsApi.finalize(recordId, version, draft)
  assert.equal(finalized.status, 'Finalized')
  assert.equal(api.calls[0][1], `/MedicalRecords/${recordId}/finalize`)
  assert.equal(api.calls[0][2].rowVersion, version)
  await assert.rejects(api.medicalRecordsApi.finalize(recordId, 'bad-version', draft))
  assert.equal(api.calls.length, 1)
})

test('authorization, validation and stale RowVersion errors remain distinct', () => {
  const api = service()
  for (const [status, phrase] of [[400, 'invalid'], [401, 'expired'], [403, 'assigned'], [404, 'not found'], [409, 'changed']]) {
    const result = api.clinicalRequestError({ isAxiosError: true, response: { status } })
    assert.match(result.message.toLowerCase(), new RegExp(phrase))
    assert.equal(result.conflict, status === 409)
  }
})

test('clinical integration source has no browser storage or clinical logging', () => {
  const source = ['src/services/medicalRecordsApi.ts', 'src/hooks/useMedicalRecord.ts']
    .map(file => readFileSync(path.resolve(__dirname, '..', file), 'utf8')).join('\n')
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./)
  assert.match(source, /retry: false/)
})
