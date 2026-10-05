// R13.08–10 in1 มือถือ: รับ 901 · จัดวัน 901/007 · เช็คอิน+ปิดงานสำเร็จ 901 ก่อน แล้ว 007
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, trackMutations, mainText, F } from './_h.mjs'
import { pick } from '../r4v3/_h.mjs'
const ONLY = process.env.ONLY ?? 'all'
const C901 = 'b976a24e-af0d-490c-a8be-e402f9b9ecd4', C007 = 'f476e94f-3375-425f-b6a7-0895e93f33a6'
const N901 = 'นายทดสอบ เอกสารชุด', N007 = 'นางสาวปิยะ เงียบ'
const card = (page, txt, btn) => page.locator('div', { hasText: txt }).filter({ has: page.getByRole('button', { name: btn, exact: true }) }).last()
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const m = trackMutations(page)
await context.grantPermissions(['geolocation'], { origin: BASE })
if (ONLY === 'all' || ONLY === 'accept') {
  await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
  log('pending', await mainText(page, 500))
  await card(page, N901, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
  log('accept toasts', await toasts(page, 3000), m.res.splice(0))
  for (const n of [N901, N007]) {
    await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(800)
    await card(page, n, 'จัดวันที่').getByRole('button', { name: 'จัดวันที่' }).click()
    const cal = page.getByRole('dialog').last(); await cal.waitFor(); await sleep(500)
    const today = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric' })
    await cal.locator(`button:has(> span:text-is("${today}"))`).first().click(); await sleep(500)
    await page.getByRole('button', { name: 'ยืนยันเลือกวันนี้' }).click()
    log('schedule', n, await toasts(page, 2500), m.res.splice(0))
  }
}
async function closeCase(n, cid, slug, gps) {
  await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(900)
  if (slug === '901') { log('tracking', await mainText(page, 700)); await shot(page, R, '08-tracking', { fullPage: true }) }
  await context.setGeolocation({ ...gps, accuracy: 15 })
  await card(page, n, 'เริ่มงาน').getByRole('button', { name: 'เริ่มงาน' }).click()
  const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(1200)
  await dlg.getByRole('button', { name: 'สำเร็จ', exact: true }).click(); await sleep(800)
  await dlg.getByRole('button', { name: /แตะเพื่อเช็คอินตำแหน่งปัจจุบัน/ }).click()
  log('checkin', slug, await toasts(page, 3500), m.res.splice(0))
  await pick(page, dlg, 'รูปถ่าย', F('R4-C1-photo.jpg'))
  await pick(page, dlg, 'วิดีโอ', F('R4-C1-video.mp4'))
  await pick(page, dlg, 'รูปสินค้ายืนยัน', F('R4-C1-product.jpg'))
  await shot(page, R, `${slug === '901' ? '09' : '10'}-close-form-${slug}`, { fullPage: true })
  await page.getByRole('button', { name: 'ยืนยันปิดงาน' }).click()
  log('close toasts', slug, await toasts(page, 4500), m.res.splice(0))
  log(q(`select c.case_ref,c.status,c.outcome,c.closed_at from cases c where id='${cid}'`))
}
if (ONLY === 'all' || ONLY === 'close901') await closeCase(N901, C901, '901', { latitude: 13.80, longitude: 100.55 })
if (ONLY === 'all' || ONLY === 'close007') await closeCase(N007, C007, '007', { latitude: 13.75, longitude: 100.56 })
await page.goto(`${BASE}/field/closed`); await settle(page); await sleep(800)
log('closed', await mainText(page, 800)); await shot(page, R, '10-closed', { fullPage: true })
log('console', consoleErrors.slice(0, 5), 'server', serverErrors)
await browser.close()
log(q(`select c.case_ref,k.checkin_type,k.checked_in_at, (k.checked_in_at at time zone 'Asia/Bangkok')::date th_date from check_ins k join cases c on c.id=k.case_id where k.case_id in ('${C901}','${C007}') order by k.checked_in_at`))
log(q(`select c.case_ref,a.asset_status,a.imei_contract from assets a join cases c on c.id=a.case_id where c.id in ('${C901}','${C007}')`))
log(q(`select c.case_ref,x.expense_type,x.gross_satang,x.status,x.expense_date from expenses x join cases c on c.id=x.case_id where c.id in ('${C901}','${C007}') order by 1,2`))
