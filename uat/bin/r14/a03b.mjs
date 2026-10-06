// R14.03b in1 มือถือ: รับงาน 2 เคส · จัดวันนี้ · เช็คอิน+ปิดงานสำเร็จ CO1-006 ก่อน แล้ว CO2-R14
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, trackMutations, mainText, F, pick } from './_h.mjs'
const ONLY = process.env.ONLY ?? 'all'
const CASES = [['นายทดสอบ ซ้ำซ้อน', 'UAT-CO1-006', 'co1-006', { latitude: 13.72, longitude: 100.58 }], ['ทดสอบ อาร์สิบสี่', 'UAT-CO2-R14', 'co2-r14', { latitude: 13.73, longitude: 100.57 }]]
const card = (page, txt, btn) => page.locator('div', { hasText: txt }).filter({ has: page.getByRole('button', { name: btn, exact: true }) }).last()
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const m = trackMutations(page)
await context.grantPermissions(['geolocation'], { origin: BASE })
if (ONLY === 'all' || ONLY === 'accept') {
  for (const [n] of CASES) {
    await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
    await card(page, n, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
    log('accept', n, await toasts(page, 3000), m.res.splice(0))
  }
  for (const [n] of CASES) {
    await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(800)
    await card(page, n, 'จัดวันที่').getByRole('button', { name: 'จัดวันที่' }).click()
    const cal = page.getByRole('dialog').last(); await cal.waitFor(); await sleep(500)
    const today = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric' })
    await cal.locator(`button:has(> span:text-is("${today}"))`).first().click(); await sleep(500)
    await page.getByRole('button', { name: 'ยืนยันเลือกวันนี้' }).click()
    log('schedule', n, await toasts(page, 2500), m.res.splice(0))
  }
}
if (ONLY === 'all' || ONLY === 'close') for (const [n, ref, slug, gps] of CASES) {
  await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(900)
  if (slug === 'co1-006') { log('tracking', await mainText(page, 700)); await shot(page, R, '03-tracking', { fullPage: true }) }
  await context.setGeolocation({ ...gps, accuracy: 15 })
  await card(page, n, 'เริ่มงาน').getByRole('button', { name: 'เริ่มงาน' }).click()
  const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(1200)
  await dlg.getByRole('button', { name: 'สำเร็จ', exact: true }).click(); await sleep(800)
  await dlg.getByRole('button', { name: /แตะเพื่อเช็คอินตำแหน่งปัจจุบัน/ }).click()
  log('checkin', ref, await toasts(page, 3500), m.res.splice(0))
  await pick(page, dlg, 'รูปถ่าย', F('R4-C2-photo.jpg'))
  await pick(page, dlg, 'วิดีโอ', F('R4-C2-video.mp4'))
  await pick(page, dlg, 'รูปสินค้ายืนยัน', F('R4-C2-product.jpg'))
  await shot(page, R, `03-close-form-${slug}`, { fullPage: true })
  await page.getByRole('button', { name: 'ยืนยันปิดงาน' }).click()
  log('close', ref, await toasts(page, 5000), m.res.splice(0))
  await sleep(1500)
}
await page.goto(`${BASE}/field/closed`); await settle(page); await sleep(800)
log('closed', await mainText(page, 600)); await shot(page, R, '03-closed', { fullPage: true })
log('console', consoleErrors.slice(0, 5), 'server', serverErrors)
await browser.close()
const IN = `('UAT-CO1-006','UAT-CO2-R14')`
log(q(`select c.case_ref,c.status,k.checkin_type,(k.checked_in_at at time zone 'Asia/Bangkok') th from check_ins k join cases c on c.id=k.case_id where c.case_ref in ${IN} order by k.checked_in_at`))
log(q(`select c.case_ref,a.asset_status,a.imei_contract from assets a join cases c on c.id=a.case_id where c.case_ref in ${IN}`))
log(q(`select c.case_ref,x.expense_type,x.gross_satang,x.status,x.expense_date from expenses x join cases c on c.id=x.case_id where c.case_ref in ${IN} order by 1,2`))
log(q(`select c.case_ref,e.file_hashes is not null h, cardinality(e.photos) p,cardinality(e.videos) v,cardinality(e.product_photos) pp from case_evidences e join cases c on c.id=e.case_id where c.case_ref in ${IN}`))
