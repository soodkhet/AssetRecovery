import { openAs, shot, R, ID, log, q, q1, settle, sleep, waitToast, mainText, dlgText, api, guard2xx, BASE } from './_h.mjs'
log('=== R7.11-12', new Date().toISOString())
const a = await openAs('uat.account'); const p = a.page
const resps = []
p.on('response', async r => { if (r.url().includes('/api/accounting/tax-invoices') && r.request().method() === 'POST') { let b=''; try { b = await r.text() } catch {} resps.push(`${r.status()} ${b.slice(0,400)}`) } })
await p.goto(`${BASE}/accounting?tab=sales`); await settle(p); await sleep(800)
const sel = p.locator('main select').filter({ has: p.locator('option', { hasText: 'ยังไม่ออกใบกำกับ' }) })
if (await sel.count()) await sel.first().selectOption({ label: 'ยังไม่ออกใบกำกับ' }); else await p.getByRole('button', { name: 'ยังไม่ออกใบกำกับ' }).first().click()
await settle(p); await sleep(600)
log('awaiting rows', await p.locator('tbody tr').count(), (await p.locator('tbody').first().innerText()).replace(/\s+/g,' ').slice(0,500))
await shot(p, R, '11a-sales-awaiting')
for (const [co, slug, sid] of [['ยูเอที ลิสซิ่ง', '11', ID.SL], ['ยูเอที แคปปิตอล', '12', ID.SC]]) {
  await p.locator('tbody tr').filter({ hasText: co }).getByRole('button', { name: 'ออกใบกำกับภาษี' }).click(); await sleep(800)
  log(slug, 'dlg', await dlgText(p, 900))
  await shot(p, R, `${slug}b-issue-modal`)
  await p.locator('[role="dialog"]').last().getByRole('button', { name: 'ยืนยันออกใบกำกับภาษี' }).dblclick()
  log(slug, 'toast', await waitToast(p, 10000)); await sleep(1500)
  log(slug, 'resps', resps.splice(0))
  await shot(p, R, `${slug}c-issue-toast`)
  if (slug === '11') {
    const x = await api(p, 'POST', '/api/accounting/tax-invoices', { salesRecordId: sid }); log('11 api dup', x); guard2xx('dup inv', x)
  }
  await settle(p); await sleep(500)
}
if (await sel.count()) await sel.first().selectOption({ label: 'ออกใบกำกับแล้ว' }); else await p.getByRole('button', { name: 'ออกใบกำกับแล้ว' }).first().click()
await settle(p); await sleep(600)
log('issued rows', (await p.locator('tbody').first().innerText()).replace(/\s+/g,' ').slice(0,600))
await shot(p, R, '12d-sales-issued')
// PDF
const ids = q(`select id from tax_invoices order by invoice_number`).split('\n').map(s=>s.trim()).filter(s=>/^[0-9a-f-]{36}$/.test(s))
for (const id of ids) { const r = await p.request.get(`${BASE}/api/accounting/tax-invoices/${id}/pdf`); const b = await r.body(); log('pdf', id.slice(0,8), r.status(), r.headers()['content-type'], b.length); const fs = await import('node:fs'); fs.mkdirSync('uat/fixtures/downloads-R7v3', { recursive: true }); fs.writeFileSync(`uat/fixtures/downloads-R7v3/tax-invoice-${id.slice(0,8)}.pdf`, b) }
log('errs A', a.consoleErrors.slice(0,3), a.serverErrors)
await a.browser.close()
const f = await openAs('uat.finance')
const x = await api(f.page, 'POST', '/api/accounting/tax-invoices', { salesRecordId: ID.SC }); log('11 finance POST', x); guard2xx('fin inv', x)
await f.browser.close()
log(q(`select t.invoice_number, t.invoice_date, t.status, s.total_before_vat_satang, s.vat_satang, s.total_satang from tax_invoices t join sales_records s on s.id=t.sales_record_id order by 1`))
log(q(`select tax_invoice_seq from organizations`))
