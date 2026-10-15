import { test, expect } from './authenticated.fixture.js'

test('saved session restores a backend-verified Patient dashboard', async ({ page }) => {
  const verification = page.waitForResponse(r => new URL(r.url()).pathname.toLowerCase() === '/api/auth/me')
  await page.goto('/')
  const response = await verification
  expect(response.status(), 'Real Auth/me status').toBe(200)
  const patientRole = (await response.json()).role === 'Patient'
  expect(patientRole, 'Backend confirms Patient role').toBe(true)
  await expect(page.getByRole('heading', { name: 'Patient Dashboard', exact: true })).toBeVisible()
  await expect(page).toHaveURL('http://localhost:5173/')
})
