// R13.15 รับเข้า 901 (probe IMEI) · R13.16 รับเข้า 007 ด้วยจุดคั่น
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, F } from './_h.mjs'
const T = new Date().toISOString()
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const { browser, page, serverErrors } = await openAs('uat.admin')
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && /\/api\/assets\//.test(u)) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`) })
const angles = [['ด้านหน้า', 'front'], ['ด้านหลัง', 'back'], ['ด้านบน', 'top'], ['ด้านล่าง', 'bottom'], ['ด้านซ้าย', 'left'], ['ด้านขวา', 'right'], ['IMEI บนเครื่อง', 'imei']]
async function open(ref) {
  await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(700)
  await page.locator('tr', { hasText: ref }).first().getByRole('button', { name: 'รับเข้าคลัง', exact: true }).click(); await sleep(900)
  return page.locator('[role="dialog"]').last()
}
async function photos(dlg) {
  for (const [label, a] of angles) {
    const lab = dlg.locator('label', { hasText: label }).first()
    await lab.locator('input[type=file]').setInputFiles(F(`R5-C1-intake-${a}.png`))
    await lab.getByText('ถ่ายแล้ว').waitFor({ timeout: 30000 })
  }
}
const imeiBox = async dlg => { const t = flat(await dlg.innerText()); const i = t.indexOf('IMEI ที่'); return t.slice(Math.max(0, i), i + 420) }
if (process.env.ONLY !== '007') {
  const dlg = await open('UAT-CO1-901')
  const imei = dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI')
  const btn = () => dlg.getByRole('button', { name: /ยืนยันรับ/ })
  await dlg.getByRole('button', { name: 'ปกติ', exact: true }).click()
  await photos(dlg)
  // ว่าง
  await imei.fill(''); await sleep(300)
  log('empty: btn disabled?', await btn().first().isDisabled(), '|', await imeiBox(dlg))
  if (!(await btn().first().isDisabled())) { await btn().first().click(); await sleep(800); log('empty click →', await imeiBox(dlg), res.splice(0)) }
  await shot(page, R, '15-intake-imei-empty')
  for (const [v, slug] of [['35990100000901A', 'alpha'], ['3599010000090111', '16digits']]) {
    await imei.fill(v); await sleep(400)
    log(`${v}:`, await imeiBox(dlg), 'btn disabled?', await btn().first().isDisabled())
    await shot(page, R, `15-intake-imei-${slug}`)
  }
  await imei.fill('359901000009012'); await sleep(400)
  log('wrong1 before click:', await imeiBox(dlg))
  await btn().first().click(); await sleep(900)
  log('wrong1 after click:', flat(await dlg.innerText()).slice(-500), 'buttons', JSON.stringify(await dlg.getByRole('button').allInnerTexts()), res.splice(0))
  await shot(page, R, '15-intake-imei-mismatch')
  // ไม่ยืนยันซ้ำ — เปลี่ยนเป็นค่าที่ถูก (ขีดคั่น)
  await imei.fill('359901-000009-011'); await sleep(400)
  log('dash:', await imeiBox(dlg))
  await shot(page, R, '15-intake-imei-dash')
  await btn().first().click()
  log('901 toasts', await toasts(page, 3000), res.splice(0))
  await sleep(800)
}
if (process.env.ONLY !== '901') {
  const dlg = await open('UAT-CO2-007')
  await dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI').fill('356789.100000.078'); await sleep(400)
  log('007 dot:', await imeiBox(dlg))
  await dlg.getByRole('button', { name: 'ปกติ', exact: true }).click()
  await photos(dlg)
  await shot(page, R, '16-intake-007-dot')
  await dlg.getByRole('button', { name: /ยืนยันรับ/ }).first().click()
  log('007 toasts', await toasts(page, 3000), res.splice(0))
}
log('5xx', serverErrors)
await browser.close()
log(q(`select c.case_ref,a.asset_status,a.imei_contract,a.imei_actual,a.imei_match_status,cardinality(a.photos) photos from assets a join cases c on c.id=a.case_id where c.case_ref in ('UAT-CO1-901','UAT-CO2-007')`))
log(q(`select action,target_type,count(*) from audit_logs where created_at>'${T}' and action<>'login' group by 1,2`))
