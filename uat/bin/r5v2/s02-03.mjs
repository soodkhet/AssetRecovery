// R5.02 ธุรการเปิดคลัง + กระดิ่ง · R5.03 probe หน้าจอ modal C1 (ไม่ยิง API)
import { openAs, shot, BASE, settle, sleep, mainText, dlgText, log, q, R, SQL } from './_h.mjs'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.admin')
log('=== s02-03', new Date().toISOString())
const intakeReqs = []
page.on('request', r => { if (r.method() !== 'GET' && /\/api\/assets\/.+\/(intake|reject-intake)/.test(r.url())) intakeReqs.push(`${r.method()} ${r.url()}`) })
await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(800)
log('R5.02 nav:', flat2(await page.locator('nav').first().innerText().catch(() => '')))
log('R5.02 tabs:', JSON.stringify(await page.getByRole('tab').allInnerTexts()))
for (const ref of ['UAT-CO1-001', 'UAT-CO1-002', 'UAT-CO1-004', 'UAT-CO2-005', 'UAT-CO2-003', 'UAT-CO2-007']) {
  const row = page.locator('tr', { hasText: ref }); const n = await row.count()
  log(`R5.02 row ${ref}: ${n}`, n ? flat2(await row.first().innerText()) : '')
}
log('R5.02 main:', await mainText(page, 1200))
await shot(page, R, 'R5.02-admin-warehouse', { fullPage: true })
await page.getByRole('button', { name: /แจ้งเตือน/ }).first().click(); await sleep(1200)
const t = flat2(await page.locator('body').innerText()); const i = t.indexOf('ยังไม่อ่าน')
log('R5.02 bell:', t.slice(Math.max(0, i - 50), i + 1000))
log('R5.02 bell rows รอรับทรัพย์:', (t.match(/ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง/g) ?? []).length)
await shot(page, R, 'R5.02-admin-bell')
await page.keyboard.press('Escape'); await sleep(400)
await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(600)

// R5.03
await page.locator('tr', { hasText: 'UAT-CO1-001' }).first().getByRole('button', { name: 'รับเข้าคลัง', exact: true }).click(); await sleep(800)
const dlg = page.locator('[role="dialog"]').last()
const imei = dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI')
const confirmBtn = () => dlg.getByRole('button', { name: /ยืนยันรับ/ })
log('R5.03 modal:', await dlgText(page, 900))
// 1
await imei.fill('356789100000011'); await sleep(300)
log('R5.03.1a match box:', (await dlg.innerText()).includes('ตรงกับสัญญา'))
await confirmBtn().click(); await sleep(600)
log('R5.03.1 no condition:', await dlgText(page, 700)); await shot(page, R, 'R5.03-no-condition')
// 2
await dlg.getByRole('button', { name: 'ปกติ', exact: true }).click()
await imei.fill('35678910000001'); await sleep(300)
await confirmBtn().click(); await sleep(600)
log('R5.03.2 imei14:', await dlgText(page, 700)); await shot(page, R, 'R5.03-imei14')
// 3
await imei.fill('356789-100000011'); await sleep(300)
log('R5.03.3 dash value:', await imei.inputValue(), '|', await dlgText(page, 600)); await shot(page, R, 'R5.03-imei-dash')
// 4
await imei.fill('356789100000999'); await sleep(300)
log('R5.03.4 before click:', await dlgText(page, 500))
await confirmBtn().click(); await sleep(600)
log('R5.03.4 after 1 click:', await dlgText(page, 900))
log('R5.03.4 footer:', JSON.stringify(await dlg.locator('button').allInnerTexts()))
await shot(page, R, 'R5.03-imei-mismatch')
// 5
await imei.fill('356789100000011'); await sleep(200)
await dlg.getByRole('button', { name: 'ชำรุด', exact: true }).click(); await sleep(300)
log('R5.03.5 btn label now:', JSON.stringify(await confirmBtn().allInnerTexts()))
await confirmBtn().click(); await sleep(600)
log('R5.03.5 damaged no note:', await dlgText(page, 800)); await shot(page, R, 'R5.03-damaged-no-note')
// 6
await imei.fill(''); await sleep(400)
log('R5.03.6 empty imei:', await dlgText(page, 900)); await shot(page, R, 'R5.03-imei-empty')
await dlg.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(500)
log('R5.03 intake/reject requests (ต้อง 0):', intakeReqs.length, intakeReqs)
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
log(q(SQL.asset))
function flat2(s) { return s.replace(/\s*\n+\s*/g, ' | ').slice(0, 600) }
