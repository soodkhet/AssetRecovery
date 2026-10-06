// R14.05 รับเข้าคลัง UAT-CO1-006 + UAT-CO2-R14 (IMEI ตรงสัญญา · 7 มุม) → ล็อต CO1 + ล็อต CO2 → แนบใบเซ็นรับ → ยืนยัน
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, F } from './_h.mjs'
const T = new Date().toISOString()
const SCHED = new Date(Date.now() + 7 * 3600e3 - 10 * 60e3).toISOString().slice(0, 16)
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const { browser, page, serverErrors } = await openAs('uat.admin')
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && u.includes('/api/') && !u.includes('/storage/')) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`) })
const angles = [['ด้านหน้า', 'front'], ['ด้านหลัง', 'back'], ['ด้านบน', 'top'], ['ด้านล่าง', 'bottom'], ['ด้านซ้าย', 'left'], ['ด้านขวา', 'right'], ['IMEI บนเครื่อง', 'imei']]
if (process.env.ONLY !== 'lots') for (const [ref, imei, slug] of [['UAT-CO1-006', '356789100000060', 'co1-006'], ['UAT-CO2-R14', '356789100000141', 'co2-r14']]) {
  await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(700)
  await page.locator('tr', { hasText: ref }).first().getByRole('button', { name: 'รับเข้าคลัง', exact: true }).click(); await sleep(900)
  const dlg = page.locator('[role="dialog"]').last()
  await dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI').fill(imei); await sleep(400)
  await dlg.getByRole('button', { name: 'ปกติ', exact: true }).click()
  for (const [label, a] of angles) {
    const lab = dlg.locator('label', { hasText: label }).first()
    await lab.locator('input[type=file]').setInputFiles(F(`R5-C1-intake-${a}.png`))
    await lab.getByText('ถ่ายแล้ว').waitFor({ timeout: 30000 })
  }
  const t = flat(await dlg.innerText()); const i = t.indexOf('IMEI ที่'); log(ref, 'imei box', t.slice(i, i + 200))
  await shot(page, R, `05-intake-${slug}`)
  await dlg.getByRole('button', { name: /ยืนยันรับ/ }).first().click()
  log('intake', ref, await toasts(page, 3000), res.splice(0)); await sleep(800)
}
async function makeLot(co, n) {
  await page.goto(`${BASE}/warehouse`); await settle(page)
  await page.getByRole('tab', { name: /^ในคลัง/ }).click(); await sleep(800)
  await page.getByText(co).last().click(); await sleep(900)
  await page.getByRole('checkbox', { name: 'เลือกทุกเครื่องที่พร้อมส่ง' }).check(); await sleep(400)
  await page.getByRole('button', { name: /นัดวันส่งมอบ \(1\)/ }).click(); await sleep(900)
  const dlg = page.locator('[role="dialog"]').last()
  await dlg.getByRole('button', { name: /ไฟแนนซ์มารับที่คลัง/ }).click(); await sleep(300)
  await dlg.locator('input[type=datetime-local]').fill(SCHED)
  await dlg.getByPlaceholder('เช่น คุณวิภา ฝ่ายติดตามทรัพย์').fill('คุณวิภา ฝ่ายติดตามทรัพย์ (UAT)')
  await dlg.getByPlaceholder('บันทึกเพิ่มเติม...').fill(`UAT R14 ล็อต ${n}`)
  await dlg.getByRole('button', { name: 'บันทึกการนัด' }).click()
  log('lot', n, await toasts(page, 3000), res.splice(0))
}
await makeLot('บริษัท ยูเอที ลิสซิ่ง จำกัด', 'CO1')
await makeLot('บริษัท ยูเอที แคปปิตอล จำกัด', 'CO2')
for (const pdf of ['R5-LOT-CO1-signed-v2.pdf', 'R5-LOT-CO2-signed.pdf']) {
  await page.goto(`${BASE}/warehouse`); await settle(page)
  await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await sleep(900)
  await page.getByRole('button', { name: 'แนบเอกสาร', exact: true }).nth(0).click(); await sleep(1000)
  const dlg = page.locator('[role="dialog"]').last()
  const head = (await dlg.innerText()).split('\n')[0]
  await dlg.locator('label', { hasText: /เลือกไฟล์|แนบไฟล์ใหม่แทน/ }).nth(0).locator('input[type=file]').setInputFiles(F(pdf))
  log('attach', head, await toasts(page, 3000)); await sleep(1500); await settle(page)
  await shot(page, R, `05-confirm-${pdf.includes('CO1') ? 'co1' : 'co2'}`)
  await dlg.getByRole('button', { name: 'ยืนยันส่งมอบสำเร็จ' }).click()
  log('confirm', head, await toasts(page, 4000), res.splice(0)); await sleep(1000)
}
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await sleep(1000)
await shot(page, R, '05-lots-confirmed', { fullPage: true })
log('5xx', serverErrors)
await browser.close()
const IN = `('UAT-CO1-006','UAT-CO2-R14')`
log(q(`select c.case_ref,a.asset_status,a.imei_actual,cardinality(a.photos) photos from assets a join cases c on c.id=a.case_id where c.case_ref in ${IN}`))
log(q(`select l.lot_number,l.doc_ref,l.status,l.signed_doc_url,(select string_agg(c.case_ref||':'||a.asset_status,',') from assets a join cases c on c.id=a.case_id where a.lot_id=l.id) from handover_lots l where l.created_at>'${T}' order by 1`))
log(q(`select c.case_ref,x.expense_type,x.gross_satang,x.status from expenses x join cases c on c.id=x.case_id where c.case_ref in ${IN} order by 1,2`))
log(q(`select count(*) revenues_new from revenues where created_at>'${T}'`))
