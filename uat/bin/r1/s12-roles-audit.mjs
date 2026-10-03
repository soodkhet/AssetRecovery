import { openAs, shot, BASE, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
await page.goto(`${BASE}/settings/roles`); await settle(page)
log('R1.35 heading', (await page.locator('main').first().innerText()).match(/บทบาทพื้นฐาน[^\n]*/)?.[0])
const tabs = ['แอดมิน', 'เจ้าหน้าที่ติดตามทรัพย์', 'บริษัทไฟแนนซ์']
const slug = ['admin', 'field', 'company']
for (let i = 0; i < 3; i++) {
  await page.getByRole('tab', { name: new RegExp(tabs[i]) }).click(); await settle(page)
  const rows = (await page.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').slice(0, 140))
  log('R1.35', tabs[i], JSON.stringify(rows))
  const del = page.locator('tbody tr').getByRole('button', { name: 'ลบ' })
  const n = await del.count()
  const st = await del.evaluateAll(bs => bs.map(b => `${b.disabled}|${b.title}`))
  log('R1.35 delete buttons', n, JSON.stringify([...new Set(st)]))
  await shot(page, 'R1', `R1.35-roles-${slug[i]}`, { fullPage: true })
}
await page.getByRole('tab', { name: /แอดมิน/ }).click(); await settle(page)
await page.getByRole('row').filter({ hasText: /^\s*การเงิน/ }).first().getByRole('button', { name: 'กำหนดสิทธิ์' }).click()
const dlg = page.getByRole('dialog')
await page.getByText('กำลังโหลดรายการสิทธิ์...').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
log('R1.35 modal title', await dlg.locator('h2,h3').first().innerText())
log('R1.35 modal excerpt', (await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 600))
log('R1.35 modal buttons', JSON.stringify(await dlg.getByRole('button').allInnerTexts()))
await shot(page, 'R1', 'R1.35-perm-modal-finance', { fullPage: true })
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
// R1.36
await page.goto(`${BASE}/settings/audit-logs`); await settle(page)
const sels = await page.locator('main select').evaluateAll(ss => ss.map(s => (s.id || s.getAttribute('aria-label')) + ': ' + [...s.options].map(o => o.text).slice(0, 12).join('|')))
log('R1.36 filters', JSON.stringify(sels))
for (const sel of await page.locator('main select').all()) {
  const opts = await sel.locator('option').allInnerTexts()
  const actor = opts.find(o => o.includes('ผู้ดูแลระบบ (เครื่อง dev)'))
  if (actor) await sel.selectOption({ label: actor })
  const act = opts.find(o => o.trim() === 'สร้าง')
  if (act) await sel.selectOption({ label: act })
}
await settle(page); await sleep(1000)
const t = (await page.locator('main').first().innerText())
log('R1.36 count', t.match(/แสดง[^\n]*รายการ/)?.[0])
log('R1.36 rows', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).slice(0, 6).map(x => x.replace(/\s+/g, ' ').slice(0, 220))))
await shot(page, 'R1', 'R1.36-audit-creates', { fullPage: true })
log('mut', m.reqs)
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
