import { openAs, BASE, settle, log, txt, shot, step, sleep, fieldsOf } from './_a.mjs'
const s = await openAs('uat.exec'); const p = s.page
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1500)
  await p.locator('main').getByRole('button', { name: 'นโยบายการมอบหมายงาน', exact: true }).first().click(); await settle(p, 1000)
  const t = await txt(p.locator('main'), 4000); const f = await fieldsOf(p.locator('main'))
  await shot(p, 'A2-exec-assignment', true)
  log(t.slice(t.indexOf('นโยบายการมอบหมายงาน |')), f.slice(1).join('\n'))
  await p.goto(`${BASE}/settings/device-catalog`); await settle(p, 3000)
  const dv = await txt(p.locator('main'), 1500); await shot(p, 'A2-exec-device')
  log('DEV', dv)
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
