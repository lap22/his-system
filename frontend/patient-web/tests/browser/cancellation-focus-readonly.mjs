import { chromium, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Client-only smoke: execute the production handler with real MUI exit/focus behavior.
// No patient data, authentication, API responses, screenshots or persisted browser state.
const source = readFileSync('src/pages/AppointmentDetailsPage.tsx', 'utf8')
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'restoreCancellationFocus') handler = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
if (!handler || !source.includes('onExited: restoreCancellationFocus') || !source.includes('disableRestoreFocus')) throw Error('Production focus wiring missing')
const origin = 'http://localhost:5173'
const pageModule = await (await fetch(origin + '/src/pages/AppointmentDetailsPage.tsx')).text()
const mainModule = await (await fetch(origin + '/src/main.tsx')).text()
function dependency(text, name) {
  const paths = [...text.matchAll(/"([^"\n]*\.js(?:\?[^"\n]*)?)"/g)].map(match => match[1])
  const found = paths.find(path => path.includes('/' + name + '.js'))
  if (!found) throw Error('Vite module not found: ' + name)
  return found
}
const urls = { react: dependency(pageModule, 'react'), mui: dependency(pageModule, '@mui_material'), dom: dependency(mainModule, 'react-dom_client') }
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  let apiCalls = 0
  await context.route('**/api/**', route => { apiCalls++; return route.abort() })
  const page = await context.newPage()
  await page.goto(origin + '/login')
  await page.evaluate(async ({ urls, handler }) => {
    const reactModule = await import(urls.react)
    const React = reactModule.default ?? reactModule
    const domModule = await import(urls.dom)
    const createRoot = domModule.createRoot ?? domModule.default.createRoot
    const { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } = await import(urls.mui)
    const h = React.createElement
    document.querySelector('#root').hidden = true
    const node = document.createElement('div')
    document.body.append(node)
    const root = createRoot(node)
    function FocusSmoke() {
      const [open, setOpen] = React.useState(false)
      const [removed, setRemoved] = React.useState(false)
      const [disabled, setDisabled] = React.useState(false)
      const cancellationTrigger = React.useRef(null)
      const detailsHeading = React.useRef(null)
      const restore = new Function('cancellationTrigger', 'detailsHeading', 'return (' + handler + ')')(cancellationTrigger, detailsHeading)
      return h(React.Fragment, null,
        h('h1', { ref: detailsHeading, tabIndex: -1 }, 'Focus smoke details'),
        !removed && h(Button, { disabled, onClick: event => { cancellationTrigger.current = event.currentTarget; setOpen(true) } }, 'Open cancellation smoke'),
        h(Dialog, { open, onClose: () => setOpen(false), disableRestoreFocus: true, fullWidth: true,
          'aria-labelledby': 'focus-smoke-title', slotProps: { transition: { onExited: restore } } },
        h(DialogTitle, { id: 'focus-smoke-title' }, 'Read-only focus smoke'),
        h(DialogContent, null, h(TextField, { label: 'Smoke reason', autoFocus: true })),
        h(DialogActions, null,
          h(Button, { onClick: () => setRemoved(true) }, 'Remove background trigger'),
          h(Button, { onClick: () => setDisabled(true) }, 'Disable background trigger'),
          h(Button, { onClick: () => setOpen(false) }, 'Keep smoke appointment'),
          h(Button, { onClick: () => setOpen(false) }, 'Done smoke'))))
    }
    window.mountFocusSmoke = () => root.render(h(FocusSmoke, { key: Math.random() }))
    window.mountFocusSmoke()
  }, { urls, handler })
  for (const mode of ['connected', 'disabled', 'removed']) {
    if (mode !== 'connected') await page.evaluate(() => window.mountFocusSmoke())
    const trigger = page.getByRole('button', { name: 'Open cancellation smoke', exact: true })
    await expect(trigger).toBeEnabled()
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Read-only focus smoke' })
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel('Smoke reason', { exact: true })).toBeFocused()
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab')
      if (!await page.evaluate(() => Boolean(document.activeElement.closest('[role=dialog]')))) throw Error('Focus escaped dialog')
    }
    if (mode === 'connected') await page.keyboard.press('Escape')
    else {
      await dialog.getByRole('button', { name: mode === 'removed' ? 'Remove background trigger' : 'Disable background trigger', exact: true }).click()
      await dialog.getByRole('button', { name: 'Done smoke', exact: true }).click()
    }
    await expect(dialog).toBeHidden()
    await expect(mode === 'connected' ? trigger : page.getByRole('heading', { name: 'Focus smoke details' })).toBeFocused()
    console.log('PASS read-only keyboard smoke: ' + mode + ' trigger; exit-timed restoration')
  }
  if (apiCalls !== 0) throw Error('Unexpected API request in isolated keyboard smoke')
  console.log('Stage 1 keyboard smoke: 3/3 PASS; 0 API requests, 0 writes, no API response mocks.')
  await context.close()
} finally { await browser.close() }
