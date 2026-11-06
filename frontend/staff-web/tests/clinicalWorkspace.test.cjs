const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

function loader() {
  const cache = new Map()
  return function load(relative) {
    const base = path.resolve(__dirname, '..', relative)
    const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
    assert.ok(file, `Missing module ${relative}`)
    if (cache.has(file)) return cache.get(file).exports
    const loaded = new Module(file)
    loaded.paths = Module._nodeModulePaths(path.dirname(file))
    const originalRequire = loaded.require.bind(loaded)
    loaded.require = name => name.startsWith('.')
      ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)))
      : originalRequire(name)
    cache.set(file, loaded)
    loaded._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, file)
    return loaded.exports
  }
}

const load = loader()
const draft = load('src/types/clinicalDraft.ts')
const proposed = load('src/types/proposedMedicalRecords.ts')
const page = readFileSync(path.resolve(__dirname, '../src/pages/ClinicalExaminationPage.tsx'), 'utf8')
const details = readFileSync(path.resolve(__dirname, '../src/pages/DoctorAppointmentDetailsPage.tsx'), 'utf8')
const router = readFileSync(path.resolve(__dirname, '../src/routes/router.tsx'), 'utf8')
const blank = () => ({ ...draft.emptyClinicalDraft })

test('clinical limits match the approved contract', () => assert.deepEqual(draft.clinicalFieldLimits,
  { chiefComplaint: 2000, symptoms: 2000, diagnosis: 2000, treatment: 2000, doctorNotes: 4000 }))
test('incomplete and empty drafts remain editable', () => assert.equal(draft.clinicalDraftSchema.safeParse(blank()).success, true))
test('chief complaint is required only for review readiness', () => assert.equal(draft.clinicalFinalizationReviewSchema.safeParse({ ...blank(), diagnosis: 'Dx' }).success, false))
test('diagnosis is required only for review readiness', () => assert.equal(draft.clinicalFinalizationReviewSchema.safeParse({ ...blank(), chiefComplaint: 'Concern' }).success, false))
test('trimmed required clinical values pass review', () => assert.equal(draft.clinicalFinalizationReviewSchema.safeParse({ ...blank(), chiefComplaint: ' Concern ', diagnosis: ' Dx ' }).success, true))
test('chief complaint maximum is enforced', () => assert.equal(draft.clinicalDraftSchema.safeParse({ ...blank(), chiefComplaint: 'x'.repeat(2001) }).success, false))
test('symptoms maximum is enforced', () => assert.equal(draft.clinicalDraftSchema.safeParse({ ...blank(), symptoms: 'x'.repeat(2001) }).success, false))
test('diagnosis maximum is enforced', () => assert.equal(draft.clinicalDraftSchema.safeParse({ ...blank(), diagnosis: 'x'.repeat(2001) }).success, false))
test('treatment maximum is enforced', () => assert.equal(draft.clinicalDraftSchema.safeParse({ ...blank(), treatment: 'x'.repeat(2001) }).success, false))
test('doctor notes maximum is enforced', () => assert.equal(draft.clinicalDraftSchema.safeParse({ ...blank(), doctorNotes: 'x'.repeat(4001) }).success, false))
test('clinical route is Doctor-protected and lazy', () => { assert.match(router, /appointments\/:appointmentId\/clinical/); assert.match(router, /ClinicalExaminationPage/) })
test('clinical entry action is limited to InProgress', () => assert.match(details, /row\.status === 'InProgress'.*Open Clinical Examination/s))
test('non-InProgress appointments are rejected by the workspace', () => assert.match(page, /appointment\.status !== 'InProgress'/))
test('invalid route identifiers are rejected before workspace/query creation', () => assert.ok(page.indexOf('safeParse(appointmentId)') < page.indexOf('<ClinicalWorkspace')))
test('draft content is memory-only with no storage or API client', () => { assert.doesNotMatch(page, /localStorage|sessionStorage|apiClient/); assert.match(page, /useForm<ClinicalDraft>/) })
test('save and finalize controls are explicitly disabled', () => { assert.match(page, /<Button disabled variant="outlined">Save Draft unavailable/); assert.match(page, /<Button disabled color="success"/) })
test('unsaved content guards cover router and page unload', () => { assert.match(page, /useBlocker\(dirty\)/); assert.match(page, /useBeforeUnload/) })
test('account changes clear clinician-entered content', () => assert.match(page, /reset\(emptyClinicalDraft\).*user\?\.userId/s))
test('proposed persistence contracts remain isolated and carry concurrency metadata', () => {
  assert.ok(proposed.proposedMedicalRecordResponseSchema)
  const source = readFileSync(path.resolve(__dirname, '../src/types/proposedMedicalRecords.ts'), 'utf8')
  assert.match(source, /PROPOSED FUTURE CONTRACTS ONLY/); assert.match(source, /rowVersion/); assert.doesNotMatch(source, /apiClient|axios|fetch\(/)
})
test('proposed RowVersion contract accepts canonical eight-byte Base64 only', () => {
  assert.equal(proposed.proposedUpdateMedicalRecordRequestSchema.safeParse({ rowVersion: 'AAAAAAAAAAA=' }).success, true)
  for (const rowVersion of ['', 'AA==', 'AAAAAAAAAAA=\r\n', 'not-base64']) {
    assert.equal(proposed.proposedUpdateMedicalRecordRequestSchema.safeParse({ rowVersion }).success, false)
  }
})
