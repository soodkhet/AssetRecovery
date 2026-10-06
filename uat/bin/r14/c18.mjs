// R14.18 / R14.19 / R14.20 ดาวน์โหลด PDF ใบเสร็จรับเงิน/ใบกำกับภาษีจากแท็บเงินรับ (แถวละ 1 ใบ) (uat.account) · INV=INV-0005,INV-0006 · PREFIX=ชื่อไฟล์นำหน้า
import { openAs, shot, BASE, settle, sleep, log, R, q, DL } from './_h.mjs'
import { execFileSync } from 'node:child_process'
const INVS = (process.env.INV ?? 'INV-0005,INV-0006,INV-0007').split(','), PREFIX = process.env.PREFIX ?? '18'
const T = new Date().toISOString()
const a = await openAs('uat.account'); const p = a.page
await p.goto(`${BASE}/accounting?tab=receipts`); await settle(p); await sleep(1500)
await shot(p, R, `${PREFIX}-receipts-tab`, { fullPage: true })
for (const inv of INVS) {
  const row = p.locator('tbody tr').filter({ hasText: inv }).first()
  log(inv, 'row', (await row.innerText().catch(() => 'NO ROW')).replace(/\s+/g, ' ').slice(0, 300))
  const btns = row.getByRole('button', { name: /PDF/ }).or(row.getByRole('link', { name: /PDF/ }))
  const names = await btns.allInnerTexts(); log('pdf buttons', names)
  const idx = names.findIndex(n => !/ใบแจ้งหนี้/.test(n))
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), btns.nth(idx < 0 ? 0 : idx).click()])
  const out = `${DL}/${PREFIX}-${dl.suggestedFilename()}`; await dl.saveAs(out); log('saved', out)
  execFileSync('node', ['uat/bin/r14/_pdfshot.mjs', out, `uat/shots/R14/${PREFIX}-pdf-${inv}.png`])
}
log('5xx', a.serverErrors); await a.browser.close()
log(q(`select action,target_type,left(after_data::text,200) from audit_logs where created_at>'${T}' and action='export'`))
