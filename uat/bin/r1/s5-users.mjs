import { execSync } from 'node:child_process'
import { openAs, shot, BASE, P, toasts, inlineErrors, trackMutations, settle, log, sleep } from './_h.mjs'
const ONLY = process.argv[2] // 'probe' | 'system' | 'inhouse' | 'outsource' | 'company' | 'dup' | 'list'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
const M4 = {
  'uat.admin': ['สมใจ ธุรการดี', '0810000001'], 'uat.approver': ['วิภา ตรวจเคส', '0810000002'], 'uat.finance': ['กมล การเงิน', '0810000003'],
  'uat.account': ['ปรีดา บัญชีงาม', '0810000004'], 'uat.exec': ['อำนาจ บริหารกิจ', '0810000005'], 'uat.mgr.in': ['ชัยวัฒน์ จัดการทีม', '0810000006'],
  'uat.sup.in': ['สุริยา หัวหน้าเอ', '0810000007'], 'uat.agent.in1': ['อนันต์ ตามทรัพย์', '0810000008'], 'uat.agent.in2': ['บุญมี ภาคสนาม', '0810000009'],
  'uat.mgr.out': ['ธนา เอาท์ซอร์ส', '0810000010'], 'uat.agent.out1': ['ประเสริฐ รับเหมา', '0810000011'], 'uat.co1.mgr': ['มาลี ลิสซิ่ง', '0810000012'],
  'uat.co1.sup': ['นิพนธ์ ลิสซิ่ง', '0810000013'], 'uat.co2.admin': ['ศิริ แคปปิตอล', '0810000014'],
}
const AFF = { 'uat.mgr.in': 'UAT ทีม A กรุงเทพ', 'uat.sup.in': 'UAT ทีม A กรุงเทพ', 'uat.agent.in1': 'UAT ทีม A กรุงเทพ', 'uat.agent.in2': 'UAT ทีม A กรุงเทพ',
  'uat.mgr.out': 'UAT ทีม C ปทุมธานี (OS)', 'uat.agent.out1': 'UAT ทีม C ปทุมธานี (OS)',
  'uat.co1.mgr': 'บริษัท ยูเอที ลิสซิ่ง จำกัด', 'uat.co1.sup': 'บริษัท ยูเอที ลิสซิ่ง จำกัด', 'uat.co2.admin': 'บริษัท ยูเอที แคปปิตอล จำกัด' }
const exists = u => execSync(`uat/bin/q.sh "select count(*) from users where username='${u}'" | sed -n 4p`).toString().trim() !== '0'

async function openForm() {
  await page.getByRole('button', { name: '+ สร้างบัญชี' }).click()
  return page.getByRole('dialog')
}
async function createUser(u, { dbl = false, shotName } = {}) {
  if (exists(u)) { log(u, 'exists — skip'); return }
  const p = P[u]
  const dlg = await openForm()
  await dlg.locator('#user-group').selectOption(p.roleGroup)
  const roleOpts = await dlg.locator('#user-role option').allInnerTexts()
  await dlg.locator('#user-role').selectOption({ label: roleOpts.find(o => o.trim() === p.role) ?? p.role })
  await dlg.locator('#user-name').fill(M4[u][0])
  await dlg.locator('#user-username').fill(u)
  await dlg.locator('#user-email').fill(`${u}@uat.test`)
  await dlg.locator('#user-password').fill(p.initial)
  await dlg.locator('#user-confirm-password').fill(p.initial)
  await dlg.locator('#user-phone').fill(M4[u][1])
  if (p.roleGroup === 'inhouse' || p.roleGroup === 'outsource') {
    const opts = await dlg.locator('#user-team option').allInnerTexts()
    log(u, 'team opts', JSON.stringify(opts))
    await dlg.locator('#user-team').selectOption({ label: opts.find(o => o.startsWith(AFF[u])) })
  } else if (p.roleGroup === 'finance_company') {
    const opts = await dlg.locator('#user-company option').allInnerTexts()
    log(u, 'company opts', JSON.stringify(opts))
    await dlg.locator('#user-company').selectOption({ label: opts.find(o => o.startsWith(AFF[u])) })
  }
  if (shotName) await shot(page, 'R1', shotName, { fullPage: true })
  const n0 = m.res.length
  const btn = dlg.getByRole('button', { name: 'สร้างบัญชี', exact: true })
  if (dbl) await btn.dblclick(); else await btn.click()
  const t = await toasts(page, 2500)
  await settle(page)
  log(u, 'toast', JSON.stringify(t), 'res', m.res.slice(n0), 'dialog open', await dlg.isVisible())
  if (await dlg.isVisible()) { log(u, 'errors', await inlineErrors(dlg)); await dlg.getByRole('button', { name: 'ยกเลิก' }).click() }
  await sleep(3500) // ให้ toast หาย
}
await page.goto(`${BASE}/settings/users`); await settle(page)

if (ONLY === 'probe') {
  let dlg = await openForm()
  log('R1.16 group opts', JSON.stringify(await dlg.locator('#user-group option').allInnerTexts()))
  log('R1.16 note', (await dlg.innerText()).match(/ต้องเปลี่ยนรหัสผ่าน[^\n]*/)?.[0])
  await dlg.getByRole('button', { name: 'สร้างบัญชี', exact: true }).click(); await sleep(700)
  log('R1.16a errors', JSON.stringify(await inlineErrors(dlg)))
  await shot(page, 'R1', 'R1.16-user-required', { fullPage: true })
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
  dlg = await openForm()
  await dlg.locator('#user-group').selectOption('inhouse')
  await dlg.locator('#user-role').selectOption({ index: 1 })
  await dlg.locator('#user-name').fill('ทดสอบ ฟอร์ม')
  await dlg.locator('#user-username').fill('Probe User!')
  await dlg.locator('#user-password').fill('abcdefgh')
  await dlg.locator('#user-confirm-password').fill('abcdefgx')
  await dlg.getByRole('button', { name: 'สร้างบัญชี', exact: true }).click(); await sleep(700)
  log('R1.16b errors', JSON.stringify(await inlineErrors(dlg)))
  await shot(page, 'R1', 'R1.16-user-format', { fullPage: true })
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
  log('R1.16 mutations', m.reqs)
}
if (ONLY === 'system') {
  for (const u of ['uat.admin', 'uat.approver', 'uat.finance', 'uat.account', 'uat.exec']) await createUser(u, { shotName: u === 'uat.admin' ? 'R1.17-uat.admin-form' : undefined })
  await page.reload(); await settle(page)
  await shot(page, 'R1', 'R1.17-system-users-done', { fullPage: true })
}
if (ONLY === 'inhouse') {
  for (const u of ['uat.mgr.in', 'uat.sup.in', 'uat.agent.in1', 'uat.agent.in2']) await createUser(u, { shotName: u === 'uat.mgr.in' ? 'R1.18-uat.mgr.in-form' : undefined })
}
if (ONLY === 'outsource') {
  for (const u of ['uat.mgr.out', 'uat.agent.out1']) await createUser(u, { shotName: u === 'uat.mgr.out' ? 'R1.19-uat.mgr.out-form' : undefined })
}
if (ONLY === 'company') {
  for (const u of ['uat.co1.mgr', 'uat.co1.sup']) await createUser(u)
  await createUser('uat.co2.admin', { dbl: true, shotName: 'R1.20-uat.co2.admin-form' })
}
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
