const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const axios = require('axios')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

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

const id = '11111111-1111-4111-8111-111111111111'
const department = { id, name: 'Cardiology', description: null, isActive: true,
  createdAt: '2026-11-09T01:00:00Z', updatedAt: null }

test('department DTO and form contracts enforce backend field limits', () => {
  const { departmentSchema, departmentFormSchema } = loader()('src/types/adminDepartments.ts')
  assert.equal(departmentSchema.parse(department).name, 'Cardiology')
  assert.equal(departmentFormSchema.parse({ name: ' Cardiology ', description: ' Care ' }).name, 'Cardiology')
  assert.equal(departmentFormSchema.safeParse({ name: ' ', description: '' }).success, false)
  assert.equal(departmentFormSchema.safeParse({ name: 'x'.repeat(151), description: '' }).success, false)
  assert.equal(departmentFormSchema.safeParse({ name: 'Valid', description: 'x'.repeat(1001) }).success, false)
})

test('list uses the active read endpoint and validates the response', async () => {
  let received
  const apiClient = { get: async (...args) => { received = args; return { data: [department] } } }
  const api = loader({ './apiClient': { apiClient } })('src/services/adminDepartmentsApi.ts').adminDepartmentsApi
  const signal = new AbortController().signal
  assert.deepEqual(await api.list(signal), [department])
  assert.equal(received[0], '/departments'); assert.equal(received[1].signal, signal)
})

test('unsafe department mutations use exact methods and disable authentication replay', async () => {
  const calls = []
  const result = method => async (...args) => { calls.push([method, ...args]); return { data: department } }
  const apiClient = { post: result('POST'), put: result('PUT'), patch: result('PATCH') }
  const api = loader({ './apiClient': { apiClient } })('src/services/adminDepartmentsApi.ts').adminDepartmentsApi
  await api.create({ name: 'Cardiology', description: '' })
  await api.update(id, { name: 'Cardiology', description: 'Care' })
  await api.updateStatus(id, false)
  assert.deepEqual(calls.map(call => [call[0], call[1]]), [['POST', '/departments'], ['PUT', `/departments/${id}`], ['PATCH', `/departments/${id}/status`]])
  for (const call of calls) assert.equal(call.at(-1).skipAuthRetry, true)
})

test('HTTP errors distinguish validation, authorization, missing, conflict and uncertain outcomes', () => {
  const { departmentRequestMessage } = loader()('src/services/adminDepartmentsApi.ts')
  const error = (status, data = {}) => new axios.AxiosError('offline', '', {}, null, { status, data })
  assert.match(departmentRequestMessage(error(400, { message: 'Duplicate department.' })), /Duplicate/)
  assert.match(departmentRequestMessage(error(401)), /expired/)
  assert.match(departmentRequestMessage(error(403)), /permission/)
  assert.match(departmentRequestMessage(error(404)), /no longer exists/)
  assert.match(departmentRequestMessage(error(409)), /concurrently/)
  assert.match(departmentRequestMessage(new axios.AxiosError('network')), /uncertain/)
})

test('Admin boundary denies Doctor and Patient roles independently of navigation', () => {
  for (const role of ['Doctor', 'Patient']) {
    const Boundary = loader({ '../hooks/useAuth': { useAuth: () => ({ user: { role } }) } })('src/components/AdminBoundary.tsx').AdminBoundary
    assert.match(renderToStaticMarkup(React.createElement(Boundary)), /Administrator access is required/)
  }
  const Boundary = loader({ '../hooks/useAuth': { useAuth: () => ({ user: { role: 'Admin' } }) } })('src/components/AdminBoundary.tsx').AdminBoundary
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Boundary)), /Administrator access is required/)
})

test('Admin queries are account scoped and mutations have no retries', () => {
  const source = readFileSync(path.resolve(__dirname, '../src/hooks/useAdminDepartments.ts'), 'utf8')
  assert.match(source, /\['adminDepartments', userId, 'list'\]/)
  assert.match(source, /user\?\.role === 'Admin'/)
  assert.equal((source.match(/retry: false/g) || []).length, 4)
  assert.match(source, /createMutationGate/)
})

test('department page includes responsive states, validation and status confirmation', () => {
  const source = readFileSync(path.resolve(__dirname, '../src/pages/AdminDepartmentsPage.tsx'), 'utf8')
  for (const expected of ['Loading departments', 'No departments have been configured', 'Add department', 'Edit department', 'Deactivate department?', 'Activate department?']) assert.match(source, new RegExp(expected.replace('?', '\\?')))
  assert.match(source, /xs: '1fr', md: 'repeat\(2/)
  assert.match(source, /departmentFormSchema/)
})

test('Admin route is protected and clinical routes remain separate', () => {
  const router = readFileSync(path.resolve(__dirname, '../src/routes/router.tsx'), 'utf8')
  assert.ok(router.indexOf('element: <AdminBoundary />') < router.indexOf("path: 'admin/departments'"))
  assert.match(router, /path: 'appointments\/:appointmentId\/clinical'/)
  assert.doesNotMatch(readFileSync(path.resolve(__dirname, '../src/pages/AdminDepartmentsPage.tsx'), 'utf8'), /MedicalRecord|clinical/i)
})
