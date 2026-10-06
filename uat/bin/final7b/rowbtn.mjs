// แสดงปุ่มในแถว + เปิดปุ่มที่ระบุ (ไม่ยืนยัน เว้น GO=1 พร้อม TA/INPUT) · node rowbtn.mjs <user> <url> <ข้อความแถว> [ปุ่ม] [ปุ่มยืนยัน]
import { openAs, shot, log, collect, trackApi, U, clean, q } from './_h.mjs'
const [u, url, rt, btn, okName] = process.argv.slice(2)
const s = await openAs(u); const { page } = s; const api = trackApi(page)
await page.goto(U + url); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const row = page.locator('tr', { hasText: rt }).first(); log('rb', u, url, 'row', clean(await row.innerText()).slice(0, 300), '| btns', (await row.getByRole('button').allInnerTexts()).join('|'))
if (btn) { await row.getByRole('button', { name: btn }).first().click(); await page.waitForTimeout(1200); const d = page.getByRole('dialog').last()
  log('rb', 'dlg', clean(await d.innerText()).slice(0, 1600)); log('rb', 'inputs', await d.locator('input,textarea,select').evaluateAll(es => es.map(e => `${e.tagName}:${e.type}:${e.id}:${e.placeholder}`)))
  await shot(page, `rb-${rt}-${btn}`.replace(/[\s/]/g, ''), { fullPage: true })
  if (process.env.GO === '1') { if (process.env.INPUT) for (const [sel, v] of JSON.parse(process.env.INPUT)) await d.locator(sel).first().fill(v)
    for (const ta of await d.locator('textarea').all()) if (!(await ta.inputValue())) await ta.fill(process.env.TA ?? 'ด่าน 7 รอบทวน ทดสอบ')
    const ok = d.getByRole('button', { name: okName }).last(); log('rb', 'ok disabled', await ok.isDisabled()); await ok.click(); log('rb', 'act', await collect(page, 5000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 300))) } }
log('rb', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
