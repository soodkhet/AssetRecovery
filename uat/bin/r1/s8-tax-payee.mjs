import { execSync } from 'node:child_process'
import { openAs, shot, BASE, toasts, inlineErrors, fields, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
// R1.14b sequential duplicate team name (probe เพิ่ม)
const planId = execSync(`uat/bin/q.sh "select id from compensation_plans where name='UAT Inhouse' and is_current" | sed -n 4p`).toString().trim()
const r = await page.request.post(`${BASE}/api/teams`, { data: { name: 'UAT ทีม B นนทบุรี (ว่าง)', side: 'inhouse', compensationPlanId: planId, supervisorId: null, managerIds: [], provinces: ['นนทบุรี'], status: 'active', reason: 'ทดสอบชื่อทีมซ้ำแบบส่งทีละคำขอ' } })
log('R1.14b sequential dup', r.status(), (await r.text()).slice(0, 300))

// R1.24
await page.goto(`${BASE}/settings/finance?tab=tax`); await settle(page)
log('R1.24 table', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').slice(0, 200))))
await shot(page, 'R1', 'R1.24-tax-profiles', { fullPage: true })
const addTax = page.getByRole('button', { name: /เพิ่ม Tax Profile/ })
if (await addTax.count()) {
  await addTax.click(); const d = page.getByRole('dialog')
  log('R1.24 form note', (await d.innerText()).match(/[^\n]*ชนะ[^\n]*/)?.[0])
  await d.getByRole('button', { name: 'ยกเลิก' }).click()
}

// R1.25 payees
const PAYEES = [
  { u: 'อนันต์ ตามทรัพย์', nid: '1103700000011', bank: 'กสิกรไทย', acc: '1234567810' },
  { u: 'บุญมี ภาคสนาม', nid: '1103700000020', bank: 'กรุงเทพ', acc: '2345678921' },
  { u: 'ประเสริฐ รับเหมา', nid: '1103700000038', bank: 'ไทยพาณิชย์', acc: '3456789032' },
]
await page.goto(`${BASE}/settings/finance?tab=payee`); await settle(page)
let first = true
for (const p of PAYEES) {
  await page.getByRole('button', { name: /เพิ่ม Payee/ }).click()
  const dlg = page.getByRole('dialog')
  if (first) log('R1.25 fields\n  ' + await fields(dlg))
  const uo = await dlg.locator('#payee-user option').allInnerTexts()
  if (first) log('user opts', JSON.stringify(uo))
  await dlg.locator('#payee-user').selectOption({ label: uo.find(o => o.startsWith(p.u)) })
  await dlg.locator('#payee-type').selectOption({ label: 'บุคคลธรรมดา' })
  await dlg.locator('#payee-national-id').fill(p.nid)
  const to = await dlg.locator('#payee-tax-profile option').allInnerTexts()
  if (first) log('tax opts', JSON.stringify(to))
  await dlg.locator('#payee-tax-profile').selectOption({ label: to.find(o => o.startsWith('Outsource Standard 3%')) })
  const bankTag = await dlg.locator('#payee-bank').evaluate(e => e.tagName)
  if (bankTag === 'SELECT') {
    const bo = await dlg.locator('#payee-bank option').allInnerTexts()
    if (first) log('bank opts', JSON.stringify(bo))
    await dlg.locator('#payee-bank').selectOption({ label: bo.find(o => o.includes(p.bank)) })
  } else await dlg.locator('#payee-bank').fill(p.bank)
  await dlg.locator('#payee-account-name').fill(p.u)
  await dlg.locator('#payee-account-number').fill(p.acc)
  await dlg.locator('#payee-reason').fill(`เพิ่มข้อมูลผู้รับเงิน ${p.u} สำหรับ UAT รอบที่ 1`)
  if (first) await shot(page, 'R1', 'R1.25-payee-form', { fullPage: true })
  const n0 = m.res.length
  await dlg.getByRole('button', { name: 'เพิ่มผู้รับเงิน', exact: true }).click()
  log(p.u, 'toast', JSON.stringify(await toasts(page)), 'res', m.res.slice(n0), 'open', await dlg.isVisible())
  if (await dlg.isVisible()) { log('errors', await inlineErrors(dlg)); await dlg.getByRole('button', { name: 'ยกเลิก' }).click() }
  await settle(page); await sleep(3000); first = false
}
log('R1.25 table', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').slice(0, 220))))
await shot(page, 'R1', 'R1.25-payees-done', { fullPage: true })
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
