import { openAs, BASE, settle, log, fieldsOf, buttons, txt, shot } from './_a.mjs'
const [path, who = 'superadmin', click] = process.argv.slice(2)
const s = await openAs(who)
const p = s.page
try {
  await p.goto(`${BASE}${path}`); await settle(p, 1200)
  console.log('URL', p.url())
  console.log('MAIN', await txt(p.locator('main'), 4000))
  if (click) { await p.getByRole('button', { name: click }).first().click(); await settle(p, 800)
    const d = p.getByRole('dialog').last(); console.log('DIALOG', await txt(d, 3000)); console.log((await fieldsOf(d)).join('\n')) }
  else { console.log((await fieldsOf(p.locator('main'))).join('\n')); console.log('BTN', (await buttons(p.locator('main'))).join(' / ')) }
  await shot(p, 'explore-' + path.replace(/\W+/g, '_'))
  console.log('5xx', s.serverErrors, 'console', s.consoleErrors.slice(0, 5))
} finally { await s.browser.close() }
