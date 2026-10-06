// R14.09 ส่ง BL-2569-005/006 → ใบแจ้งหนี้/ใบวางบิล PDF (ดาวน์โหลดจากปุ่ม "เอกสาร")
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, DL } from './_h.mjs'
const T = new Date().toISOString()
const f = await openAs('uat.finance'); const p = f.page
const posts = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') posts.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 300)}`) })
await p.goto(`${BASE}/finance?tab=revenue`); await settle(p); await sleep(1200)
for (const bl of ['BL-2569-005', 'BL-2569-006']) {
  posts.length = 0
  const row = p.locator('tr').filter({ hasText: bl }).first()
  await row.getByRole('button', { name: 'ส่งวางบิล' }).click(); await sleep(800)
  const d = p.locator('[role="dialog"]').last()
  const ta = d.locator('textarea'); if (await ta.count()) await ta.first().fill(`UAT R14 ส่งใบแจ้งหนี้ ${bl} ทางอีเมล`)
  log(`send modal ${bl}:`, (await d.innerText()).replace(/\s+/g, ' ').slice(0, 700))
  await shot(p, R, `09-send-modal-${bl.slice(-3)}`)
  await d.getByRole('button', { name: 'ยืนยันส่งบิล' }).click(); await sleep(2500)
  log('toast send', await toasts(p, 500)); log('POST', posts)
  await settle(p); await sleep(600)
}
log(await mainText(p, 1300))
await shot(p, R, '09-after-send', { fullPage: true })
for (const bl of ['BL-2569-005', 'BL-2569-006']) {
  const row = p.locator('tr').filter({ hasText: bl }).first()
  log('row', (await row.innerText()).replace(/\s+/g, ' '))
  await row.getByRole('button', { name: 'เอกสาร' }).click(); await sleep(1500)
  const d = p.locator('[role="dialog"]').last()
  log(`doc modal ${bl}:`, (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1200))
  log('buttons', (await d.getByRole('button').allInnerTexts()).map(s => s.trim()))
  await shot(p, R, `09-doc-modal-${bl.slice(-3)}`)
  const b = d.getByRole('button', { name: /ใบแจ้งหนี้/ }).or(d.getByRole('link', { name: /ใบแจ้งหนี้/ })).first()
  if (await b.count()) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), b.click()])
    const path = `${DL}/${dl.suggestedFilename()}`; await dl.saveAs(path); log('saved', path)
  } else log('!! ไม่พบปุ่มใบแจ้งหนี้')
  await p.keyboard.press('Escape'); await sleep(600)
}
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
log(q(`select batch_number,status,sent_at at time zone 'Asia/Bangkok' sent from billing_batches where batch_number in ('BL-2569-005','BL-2569-006')`))
log(q(`select count(*) sales from sales_records`), q(`select count(*) tax_invoices from tax_invoices`))
log(q(`select action,target_type,after_data::text from audit_logs where created_at>'${T}' and action<>'login' order by created_at`))
