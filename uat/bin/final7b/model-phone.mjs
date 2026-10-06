// U166–U168 หน้า Model Phone: ค้นหา TAC · ผูก TAC เอง · ปิด/เปิดแบรนด์ · ประวัติ · นำเข้าไฟล์เอง (fixture ใน repo) — ไม่กด "อัปเดตตอนนี้"/"บังคับดึง"
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const s = await openAs('admin'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/settings/device-catalog'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const main = async () => clean(await page.locator('main').innerText())
// 1) ค้นหา TAC ที่ระบบจำ
await page.getByRole('tab', { name: 'TAC' }).or(page.getByRole('button', { name: 'TAC', exact: true })).first().click(); await page.waitForTimeout(900)
await page.getByLabel('ค้นหา TAC').fill('35123456'); await page.waitForTimeout(3000)
log('mp', 'search 35123456:', (await main()).match(/35123456.{0,200}/)?.[0])
await shot(page, 'mp-tac-search')
// 2) ผูก TAC ใหม่เอง
await page.getByLabel('ค้นหา TAC').fill('35777001'); await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'เพิ่ม/ผูก TAC เอง' }).click(); await page.waitForTimeout(800)
const d = page.getByRole('dialog').last()
log('mp', 'bind tac prefilled:', await d.locator('#bind-tac').inputValue(), '| search box value:', await page.getByLabel('ค้นหา TAC').inputValue()); if (!(await d.locator('#bind-tac').inputValue())) await d.locator('#bind-tac').fill('35777001')
await d.locator('#bind-model-search').fill('iphone 15'); await page.waitForTimeout(1500)
const opts = await d.locator('#bind-model option').evaluateAll(os => os.map(o => o.value + '=' + o.text)); log('mp', 'bind options', opts.slice(0, 5))
await d.locator('#bind-model').selectOption(opts.find(o => o.split('=')[0])?.split('=')[0])
await d.locator('#bind-reason').fill('ผูก TAC จากเครื่องจริง (ด่าน 7 รอบทวน)')
await d.getByRole('button', { name: /บันทึก|ผูก/ }).last().click(); log('mp', 'bind', clean(await d.innerText().catch(() => '')).slice(0, 200), await collect(page, 3000), api.splice(0).map(x => x.slice(0, 200)))
log('mp', q(`select t.tac,t.source,m.name from device_tacs t join device_models m on m.id=t.device_model_id where t.tac='35777001'`))
// 3) ปิด/เปิดแบรนด์ HONOR
await page.getByRole('tab', { name: 'แบรนด์' }).or(page.getByRole('button', { name: 'แบรนด์', exact: true })).first().click(); await page.waitForTimeout(900)
const row = page.locator('tr', { hasText: 'HONOR' }).first(); const sel = row.locator('select')
log('mp', 'HONOR row', clean(await row.innerText()).slice(0, 200), 'select', await sel.count())
if (await sel.count()) { await sel.first().selectOption({ label: 'ไม่แสดง (ตั้งเอง)' }); await page.waitForTimeout(1500); log('mp', 'hide HONOR', await collect(page, 2000), api.splice(0).map(x => x.slice(0, 160)))
  log('mp', 'HONOR after hide', clean(await row.innerText()).slice(0, 200))
  await sel.first().selectOption({ label: 'ตามตัวกรอง' }); await page.waitForTimeout(1500); log('mp', 'restore HONOR', await collect(page, 2000), api.splice(0).map(x => x.slice(0, 160))) }
// 4) นำเข้าไฟล์เอง
await page.getByRole('button', { name: 'นำเข้าไฟล์เอง' }).click(); await page.waitForTimeout(800)
const di = page.getByRole('dialog').last(); log('mp', 'import dlg', clean(await di.innerText()).slice(0, 400))
await di.locator('input[type=file]').setInputFiles('lib/device-catalog/fixtures/tac-sample.csv'); await page.waitForTimeout(600)
await di.getByRole('button', { name: /นำเข้า|อัปโหลด|ยืนยัน/ }).last().click(); log('mp', 'import', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 260)))
// 5) ประวัติการอัปเดต
await page.getByRole('tab', { name: 'ประวัติการอัปเดต' }).or(page.getByRole('button', { name: 'ประวัติการอัปเดต', exact: true })).first().click(); await page.waitForTimeout(1200)
const t = await main(); log('mp', 'history:', t.slice(t.indexOf('ประวัติการอัปเดต'), t.indexOf('ประวัติการอัปเดต') + 1200))
await shot(page, 'mp-history', { fullPage: true })
log('mp', 'non-GET (no sync/force expected):', api.filter(x => /sync|force|update-now/.test(x)))
log('mp', q(`select status, trigger, new_tac_count, created_at from device_tac_updates order by created_at desc limit 3`))
log('mp', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
