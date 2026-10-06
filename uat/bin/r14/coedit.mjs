// แก้ไขบริษัทผ่านหน้าจอ (admin /settings/companies → ⚙️ แก้ไขบริษัท) — R14.19 ชื่อ CO1 · R14.21 VAT mode CO2
// ใช้: node uat/bin/r14/coedit.mjs <ชื่อการ์ดปัจจุบัน> <field: name|vat> <ค่าใหม่> <เหตุผล> <tag>
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q } from './_h.mjs'
const [cur, field, value, reason, tag] = process.argv.slice(2)
const a = await openAs('admin'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 300)}`) })
await p.goto(`${BASE}/settings/companies`); await settle(p); await sleep(1000)
const card = p.locator('div').filter({ hasText: cur }).filter({ has: p.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }) }).last()
await card.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }).click(); await sleep(800)
const d = p.locator('[role="dialog"]').last()
if (field === 'name') await d.locator('#co-name').fill(value)
else {
  const sel = d.locator('#co-vat-mode')
  log('vat options', await sel.locator('option').allInnerTexts(), 'current', await sel.inputValue())
  await sel.selectOption({ label: value }); await sleep(300)
}
await d.locator('#co-reason').fill(reason)
await shot(p, R, `${tag}-form`)
await d.getByRole('button', { name: 'บันทึกการแก้ไข' }).click(); await sleep(2500)
log(`${tag} toast`, (await toasts(p, 300)).slice(0, 2)); log('res', res)
await settle(p); await shot(p, R, `${tag}-after`)
await a.browser.close()
log(q(`select name, vat_mode from finance_companies order by name`))
