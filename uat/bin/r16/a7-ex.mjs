import { openAs, BASE, settle, txt, fieldsOf, sleep } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/users`); await settle(p, 1200)
  await p.locator('main').getByText('เจ้าหน้าที่ติดตามทรัพย์', { exact: true }).first().click(); await settle(p, 1200)
  console.log(await txt(p.locator('main'), 1500))
  await p.locator('main tr').filter({ hasText: 'uat.agent.in1' }).getByRole('button', { name: 'แก้ไข', exact: true }).click(); await settle(p, 1200)
  const d = p.getByRole('dialog').last()
  console.log(await txt(d, 4000))
  for (const f of await fieldsOf(d)) console.log(f)
  for (const id of ['#user-team', '#payee-type', '#payee-income-category', '#payee-tax-profile', '#payee-bank', '#payee-name-title']) if (await d.locator(id).count()) console.log(id, await d.locator(`${id} option`).allInnerTexts())
} finally { await s.browser.close() }
