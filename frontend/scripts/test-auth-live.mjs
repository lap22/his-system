import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

// Uses the actual frontend modules against the actual API; no response stubs.
const app = process.argv[2]
if (!['patient-web', 'staff-web'].includes(app)) throw new Error('Choose patient-web or staff-web.')
const root = resolve('frontend', app)
const require = createRequire(pathToFileURL(resolve(root, 'package.json')))
const ts = require('typescript')
const env = {
  VITE_API_BASE_URL: process.env.AUTH_TEST_API_URL || 'http://localhost:5216/api',
  VITE_PORTAL: app === 'patient-web' ? 'patient' : 'staff',
}
const modules = new Map()
async function loadModule(path) {
  if (modules.has(path)) return modules.get(path)
  const source = await readFile(path, 'utf8')
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const imports = new Map()
  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) {
      const name = statement.moduleSpecifier.text
      imports.set(name, name.startsWith('.') ? await loadModule(resolve(dirname(path), name + '.ts')) : pathToFileURL(require.resolve(name)).href)
    }
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [(context) => {
      const visit = (node) => {
        if (ts.isImportDeclaration(node) && imports.has(node.moduleSpecifier.text)) {
          return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(imports.get(node.moduleSpecifier.text)), node.attributes)
        }
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'env' && ts.isMetaProperty(node.expression)) {
          return ts.factory.createObjectLiteralExpression(Object.entries(env).map(([key, value]) => ts.factory.createPropertyAssignment(key, ts.factory.createStringLiteral(value))))
        }
        return ts.visitEachChild(node, visit, context)
      }
      return (file) => ts.visitNode(file, visit)
    }] },
  }).outputText
  const url = 'data:text/javascript;base64,' + Buffer.from(output).toString('base64')
  modules.set(path, url)
  return url
}
const storage = new Map()
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}
const { authApi } = await import(await loadModule(resolve(root, 'src/services/authApi.ts')))
const { authSession } = await import(await loadModule(resolve(root, 'src/services/authSession.ts')))
const { apiClient, refreshSession } = await import(await loadModule(resolve(root, 'src/services/apiClient.ts')))
const { restoreAuth } = await import(await loadModule(resolve(root, 'src/hooks/useAuth.ts')))
const { portal } = await import(await loadModule(resolve(root, 'src/services/portal.ts')))
const { loginSchema, registerSchema } = await import(await loadModule(resolve(root, 'src/types/auth.ts')))
const validationPassword = randomBytes(24).toString('base64url')
assert.equal(loginSchema.safeParse({ email: 'invalid', password: validationPassword }).success, false)
assert.equal(loginSchema.safeParse({ email: ' person@example.invalid ', password: validationPassword }).success, true)
assert.equal(loginSchema.safeParse({ email: 'person@example.invalid', password: '' }).success, false)
assert.equal(registerSchema.safeParse({ email: 'person@example.invalid', password: '', confirmPassword: '' }).success, false)
assert.equal(registerSchema.safeParse({ email: 'person@example.invalid', password: validationPassword, confirmPassword: validationPassword + 'x' }).success, false)
console.log('PASS: frontend email, password length, and confirmation validation')
sessionStorage.setItem('his-auth-' + env.VITE_PORTAL, 'corrupted storage')
assert.equal(authSession.readStored(), null)
assert.equal(sessionStorage.getItem('his-auth-' + env.VITE_PORTAL), null)
console.log('PASS: corrupted stored credentials are removed')
let credentials
let session
const revocations = new Set()
async function rejectsStatus(action, status) {
  try { await action(); throw new Error('Expected rejection.') }
  catch (error) { assert.equal(error.response?.status, status) }
}
try {
  await rejectsStatus(() => authApi.me(), 401)
  console.log('PASS: unauthenticated /me returns 401')
  await rejectsStatus(() => authApi.login({ email: randomUUID() + '@example.invalid', password: randomBytes(24).toString('base64url') }), 401)
  console.log('PASS: invalid credentials return 401')
  if (process.env.AUTH_TEST_ALLOW_REGISTER !== '1') {
    console.log('SKIP: patient lifecycle requires AUTH_TEST_ALLOW_REGISTER=1 (creates a real test account).')
  } else {
    credentials = { email: 'fe-auth-test-' + randomUUID() + '@example.invalid', password: randomBytes(24).toString('base64url') }
    session = await authApi.register({ ...credentials, confirmPassword: credentials.password })
    revocations.add(session.refreshToken)
    assert.equal(session.role, 'Patient')
    console.log('PASS: registration creates Patient; test account: ' + credentials.email)
    session = await authApi.login(credentials)
    revocations.add(session.refreshToken)
    authSession.setSession(session)
    assert.equal((await authApi.me()).userId, session.userId)
    console.log('PASS: successful login and Bearer-authenticated /me')
    assert.equal(portal.roles.includes(session.role), app === 'patient-web')
    console.log('PASS: real Patient role accepted by Patient Portal and rejected by Staff Portal policy')
    const saved = sessionStorage.getItem('his-auth-' + env.VITE_PORTAL)
    authSession.clear()
    sessionStorage.setItem('his-auth-' + env.VITE_PORTAL, saved)
    await restoreAuth()
    assert.equal(authSession.getSnapshot().user?.userId, session.userId)
    console.log('PASS: restoration from browser storage validates /me')
    const oldRefresh = authSession.getSnapshot().session.refreshToken
    await Promise.all([refreshSession(), refreshSession(), refreshSession()])
    session = authSession.getSnapshot().session
    revocations.add(session.refreshToken)
    assert.notEqual(session.refreshToken, oldRefresh)
    await rejectsStatus(() => authApi.logout({ refreshToken: '' }), 400)
    await rejectsStatus(() => authApi.login({ ...credentials, password: '' }), 400)
    console.log('PASS: concurrent refresh is deduplicated; invalid DTOs return 400')
    await rejectsStatus(() => authApi.register({ ...credentials, confirmPassword: credentials.password }), 400)
    console.log('PASS: duplicate registration returns 400')
    await rejectsStatus(() => fetch(env.VITE_API_BASE_URL + '/Auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: oldRefresh }) }).then(async (response) => {
      if (!response.ok) throw { response: { status: response.status } }
    }), 401)
    console.log('PASS: rotated refresh token cannot be reused')
    await rejectsStatus(() => apiClient.get('/Queue/doctor'), 403)
    assert.equal(authSession.getSnapshot().session.refreshToken, session.refreshToken)
    console.log('PASS: forbidden request returns 403 without refresh or logout')
    authSession.setSession({ ...session, accessToken: 'intentionally-invalid-token' })
    await authApi.me()
    session = authSession.getSnapshot().session
    revocations.add(session.refreshToken)
    console.log('PASS: actual 401 triggers refresh and one successful retry')
    await authApi.logout({ refreshToken: session.refreshToken })
    authSession.clear()
    assert.equal(sessionStorage.getItem('his-auth-' + env.VITE_PORTAL), null)
    await rejectsStatus(() => authApi.me(), 401)
    await rejectsStatus(() => refreshSessionWithToken(session.refreshToken), 401)
    console.log('PASS: logout clears storage and revokes refresh token')
    authSession.setSession({ ...session, accessToken: 'intentionally-invalid-token' })
    await rejectsStatus(() => authApi.me(), 401)
    assert.equal(authSession.getSnapshot().session, null)
    console.log('PASS: failed refresh ends the session without an infinite retry loop')
  }
} catch (error) {
  // Never print Axios errors: their configs contain passwords and tokens.
  console.error('FAIL: authentication check; HTTP status ' + (error.response?.status ?? 'unavailable or assertion failure'))
  process.exitCode = 1
} finally {
  const current = authSession.getSnapshot().session
  if (current) revocations.add(current.refreshToken)
  for (const refreshToken of revocations) {
    try { await authApi.logout({ refreshToken }) } catch { console.error('Cleanup: server token revocation unavailable.') }
  }
  authSession.clear()
  credentials = undefined
  session = undefined
}
async function refreshSessionWithToken(refreshToken) {
  const response = await fetch(env.VITE_API_BASE_URL + '/Auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) })
  if (!response.ok) throw { response: { status: response.status } }
}
