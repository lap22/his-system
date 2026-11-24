const assert = require('node:assert/strict')
const { test } = require('node:test')
const { existsSync, readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const axios = require('axios')

function loader(overrides = {}) {
  const cache = new Map()
  function load(relative) {
    const base = path.resolve(__dirname, '..', relative); const file = [base, base + '.ts', base + '.tsx'].find(existsSync); assert.ok(file)
    if (cache.has(file)) return cache.get(file).exports
    const loaded = new Module(file); loaded.paths = Module._nodeModulePaths(path.dirname(file)); const original = loaded.require.bind(loaded)
    loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name))) : original(name)
    cache.set(file, loaded)
    const source = readFileSync(file, 'utf8').replaceAll('import.meta.env', '({ VITE_PORTAL: "staff", VITE_API_BASE_URL: "/api" })').replaceAll('import.meta.hot', 'undefined')
    loaded._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file)
    return loaded.exports
  } return load
}
const doctorId = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222', departmentId = '33333333-3333-4333-8333-333333333333'
const doctor = (changes = {}) => ({ id: doctorId, userId, email: 'doctor@example.invalid', departmentId, departmentName: 'Cardiology', fullName: 'Nguyễn Văn An', phone: null, specialization: 'Cardiology', licenseNumber: 'LIC-100', yearsOfExperience: 10, biography: null, avatarUrl: null, isActive: true, createdAt: '2026-11-09T01:00:00Z', updatedAt: null, ...changes })
const profile = { departmentId, fullName: 'Nguyễn Văn An', phone: '', specialization: 'Cardiology', licenseNumber: 'LIC-100', yearsOfExperience: 10, biography: '', avatarUrl: '' }

test('Doctor response and create/update contracts match backend limits', () => {
  const contracts = loader()('src/types/adminDoctors.ts')
  assert.equal(contracts.doctorAdminSchema.parse(doctor()).id, doctorId)
  assert.equal(contracts.createDoctorSchema.safeParse({ ...profile, email: 'doctor@example.invalid', password: '12345678' }).success, true)
  assert.equal(contracts.createDoctorSchema.safeParse({ ...profile, email: 'bad', password: 'short' }).success, false)
  assert.equal(contracts.updateDoctorSchema.safeParse({ ...profile, yearsOfExperience: 81 }).success, false)
})

test('Doctor name, department and status filters compose without cross-account data', () => {
  const { filterAdminDoctors } = loader()('src/types/adminDoctors.ts'); const other = doctor({ id: userId, fullName: 'Trần Bình', departmentId: userId, isActive: false })
  assert.deepEqual(filterAdminDoctors([doctor(), other], 'nguyễn', departmentId, 'active').map(x => x.id), [doctorId])
  assert.deepEqual(filterAdminDoctors([doctor(), other], '', userId, 'inactive').map(x => x.id), [userId])
})

test('list/detail and mutations use exact active routes with mutation replay disabled', async () => {
  const calls = []; const result = data => async (...args) => { calls.push(args); return { data } }
  const apiClient = { get: async url => { calls.push([url]); return { data: url === '/doctors' ? [doctor()] : doctor() } }, post: result(doctor()), put: result(doctor()), patch: result(doctor({ isActive: false })) }
  const api = loader({ './apiClient': { apiClient } })('src/services/adminDoctorsApi.ts').adminDoctorsApi
  await api.list(); await api.detail(doctorId); await api.create({ ...profile, email: 'doctor@example.invalid', password: '12345678' }); await api.update(doctorId, profile); await api.updateStatus(doctorId, false)
  assert.deepEqual(calls.map(x => x[0]), ['/doctors', `/doctors/${doctorId}`, '/doctors', `/doctors/${doctorId}`, `/doctors/${doctorId}/status`])
  for (const call of calls.slice(2)) assert.equal(call.at(-1).skipAuthRetry, true)
})

test('uncertain create reconciles by unique email and license without replaying POST', async () => {
  let posts = 0, gets = 0
  const apiClient = { post: async () => { posts++; throw new axios.AxiosError('network') }, get: async () => { gets++; return { data: [doctor()] } } }
  const api = loader({ './apiClient': { apiClient } })('src/services/adminDoctorsApi.ts').adminDoctorsApi
  assert.equal((await api.create({ ...profile, email: doctor().email, password: '12345678' })).id, doctorId)
  assert.equal(posts, 1); assert.equal(gets, 1)
})

test('uncertain status reconciles through one detail GET and never repeats PATCH', async () => {
  let patches = 0, gets = 0
  const apiClient = { patch: async () => { patches++; throw new axios.AxiosError('network') }, get: async () => { gets++; return { data: doctor({ isActive: false }) } } }
  const api = loader({ './apiClient': { apiClient } })('src/services/adminDoctorsApi.ts').adminDoctorsApi
  assert.equal((await api.updateStatus(doctorId, false)).isActive, false); assert.equal(patches, 1); assert.equal(gets, 1)
})

test('inconclusive uncertain mutation fails closed', async () => {
  const apiClient = { patch: async () => { throw new axios.AxiosError('network') }, get: async () => ({ data: doctor({ isActive: true }) }) }
  const module = loader({ './apiClient': { apiClient } })('src/services/adminDoctorsApi.ts')
  await assert.rejects(() => module.adminDoctorsApi.updateStatus(doctorId, false), module.DoctorMutationUncertainError)
})

test('error mapping distinguishes backend and authentication outcomes', () => {
  const message = loader()('src/services/adminDoctorsApi.ts').doctorRequestMessage
  const error = status => new axios.AxiosError('offline', '', {}, null, { status, data: {} })
  for (const [status, pattern] of [[400, /Check/], [401, /expired/], [403, /permission/], [404, /no longer/], [409, /concurrently/]]) assert.match(message(error(status)), pattern)
})

test('queries are Admin-only, account scoped and unsafe mutations never retry', () => {
  const source = readFileSync(path.resolve(__dirname, '../src/hooks/useAdminDoctors.ts'), 'utf8')
  assert.match(source, /\['adminDoctors', userId/); assert.match(source, /user\?\.role === 'Admin'/)
  assert.equal((source.match(/retry: false/g) || []).length, 5); assert.match(source, /gateFactory/)
})

test('Doctor UI preserves immutable email, password safety, confirmations and responsive states', () => {
  const page = readFileSync(path.resolve(__dirname, '../src/pages/AdminDoctorsPage.tsx'), 'utf8')
  for (const value of ['Search by Doctor name', 'All Departments', 'All statuses', 'Add Doctor', 'Edit Doctor', 'Deactivate Doctor?', 'Existing JWTs may remain valid until expiry']) assert.match(page, new RegExp(value.replace('?', '\\?')))
  assert.match(page, /type="password"/); assert.match(page, /Never stored in the browser/); assert.match(page, /email .* immutable/)
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\./)
})

test('Admin Doctor route remains protected and clinical feature remains disabled', () => {
  const routes = readFileSync(path.resolve(__dirname, '../src/routes/router.tsx'), 'utf8')
  assert.ok(routes.indexOf('element: <AdminBoundary />') < routes.indexOf("path: 'admin/doctors'"))
  assert.match(routes, /path: 'appointments\/:appointmentId\/clinical'/)
  assert.match(readFileSync(path.resolve(__dirname, '../.env.example'), 'utf8'), /VITE_CLINICAL_API_ENABLED=false/)
})
