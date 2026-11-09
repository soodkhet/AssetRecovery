import { openAs, BASE, settle, txt, shot, fieldsOf, buttons, sleep } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/device-catalog`); await settle(p, 2000)
  console.log(await txt(p.locator('main'), 2500))
  await p.getByRole('button', { name: 'รุ่น', exact: true }).click(); await settle(p, 1500)
  console.log('\n=== MODELS', await txt(p.locator('main'), 3000))
  console.log((await fieldsOf(p.locator('main'))).join('\n'))
  await shot(p, 'A3-models-tab')
} finally { await s.browser.close() }
