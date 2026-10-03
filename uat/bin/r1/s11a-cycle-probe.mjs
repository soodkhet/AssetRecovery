import { openAs, BASE, fields, settle, log } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
await page.goto(`${BASE}/settings/finance?tab=cycles`); await settle(page)
log('main', (await page.locator('main').first().innerText()).replace(/\n+/g, ' | ').slice(0, 600))
await page.getByRole('button', { name: /สร้างรอบ/ }).first().click()
const dlg = page.getByRole('dialog')
log('fields\n  ' + await fields(dlg))
for (const id of ['#cycle-type', '#cycle-cutoff-type', '#cycle-due-type', '#cycle-scope']) log(id, JSON.stringify(await dlg.locator(id + ' option').evaluateAll(os => os.map(o => o.value + '=' + o.text))))
await dlg.locator('#cycle-cutoff-type').selectOption({ index: 1 }).catch(() => {})
log('after cutoff idx1 fields\n  ' + await fields(dlg))
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
await s.browser.close()
