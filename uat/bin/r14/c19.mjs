// R14.19 หลังเปลี่ยนชื่อ CO1: ดาวน์โหลด INV-0005 (แท็บเงินรับ) + ใบแจ้งหนี้ BL-2569-005 (แท็บรายได้และขาย) ใหม่ (uat.account)
import { openAs, BASE, settle, sleep, log, q, DL } from './_h.mjs'
import { execFileSync } from 'node:child_process'
const a = await openAs('uat.account'); const p = a.page
async function dl(btn, name) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), btn.click()])
  const out = `${DL}/19-${d.suggestedFilename()}`; await d.saveAs(out); log('saved', out)
  execFileSync('node', ['uat/bin/r14/_pdfshot.mjs', out, `uat/shots/R14/19-pdf-${name}.png`])
}
await p.goto(`${BASE}/accounting?tab=receipts`); await settle(p); await sleep(1500)
await dl(p.locator('tbody tr').filter({ hasText: 'INV-0005' }).first().getByRole('button', { name: 'PDF' }), 'INV-0005')
await p.goto(`${BASE}/accounting?tab=sales`); await settle(p); await sleep(1500)
await dl(p.locator('tbody tr').filter({ hasText: 'BL-2569-005' }).first().getByRole('button', { name: 'ใบแจ้งหนี้ PDF' }), 'BL-2569-005')
await a.browser.close()
log(q(`select invoice_number,buyer_name from tax_invoices where invoice_number='INV-0005'`))
