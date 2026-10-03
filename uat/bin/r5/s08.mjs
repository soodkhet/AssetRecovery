// R5.08 C5 race รับเข้า 2 คำขอพร้อมกัน
import { openAs, shot, BASE, settle, sleep, waitToast, dlgText, log, q, fmt, R, SQL, F, A } from './_h.mjs'
const SA = await openAs('uat.admin')
const SB = await openAs('uat.admin', { fresh: true })
log('=== s08', new Date().toISOString())
const page = SA.page
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && u.includes('/api/')) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`) })
await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(600)
await page.locator('tr', { hasText: 'UAT-CO2-005' }).first().getByRole('button', { name: 'รับเข้าคลัง', exact: true }).click(); await sleep(800)
const dlg = page.locator('[role="dialog"]').last()
await dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI').fill('356789100000052'); await sleep(200)
await dlg.getByRole('button', { name: 'ปกติ', exact: true }).click()
for (const [label, a] of [['ด้านหน้า', 'front'], ['IMEI บนเครื่อง', 'imei']]) {
  const lab = dlg.locator('label', { hasText: label }).first()
  await lab.locator('input[type=file]').setInputFiles(F(`R5-C5-intake-${a}.png`))
  await lab.getByText('ถ่ายแล้ว').waitFor({ timeout: 30000 })
}
let raceB
await page.route('**/api/assets/*/intake', async (route) => {
  const body = route.request().postDataJSON()
  raceB = SB.page.request.post(`${BASE}/api/assets/${A.C5}/intake`, { data: body })
  await route.continue()
})
await dlg.getByRole('button', { name: 'ยืนยันรับเข้าคลัง' }).click()
const tA = await waitToast(page, 10000)
await sleep(1500)
const rB = await fmt(await raceB)
log('R5.08 A responses:', res)
log('R5.08 B:', rB)
log('R5.08 A toast:', tA, '| dialog:', await dlgText(page, 400))
await shot(page, R, 'R5.08-c5-race')
if (await page.locator('[role="dialog"]').count()) { await page.locator('[role="dialog"]').last().getByRole('button', { name: 'ยกเลิก' }).click().catch(() => {}); await page.reload(); await settle(page); await sleep(600) }
log('R5.08 tabs:', JSON.stringify(await page.getByRole('tab').allInnerTexts()))
log('console', SA.consoleErrors, 'server', SA.serverErrors, SB.serverErrors)
await SA.browser.close(); await SB.browser.close()
log(q(SQL.asset)); log(q(SQL.ev))
log(q(`select action,target_type,count(*) from audit_logs where created_at > '2026-10-03 13:15:30+00' group by 1,2`))
