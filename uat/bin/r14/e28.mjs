// R14.28 Export Pack v5 (บัญชี) — ดาวน์โหลด zip + SHA-256 เทียบระบบ
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText } from './_h.mjs'
const PID = '879302b0-bb29-4bae-9f9a-1e16aba8bb31'
const DL = 'uat/fixtures/downloads-R14'; mkdirSync(DL, { recursive: true })
log('=== e28', new Date().toISOString())
log('before', q('select version, status, left(file_hash,16) h from export_records order by version'))
const a = await openAs('uat.account'); const p = a.page
await p.goto(`${BASE}/accounting?tab=export`); await settle(p); await sleep(1000)
await p.locator('main').getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await sleep(800)
const d = p.locator('[role="dialog"]').last(); const sel = d.locator('select').first(); if (!(await sel.inputValue())) await sel.selectOption(PID); await sleep(500)
await d.locator('textarea').fill('UAT R14 ชุดที่ 5 หลังเอกสารเก็บเงินแบบใหม่ + รอบจ่าย IN-R14')
log('dlg', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1200)); await shot(p, R, '28-export-modal-v5')
const rp = p.waitForResponse(x => x.url().includes('/api/accounting/export-pack') && x.request().method() === 'POST', { timeout: 120000 })
await d.getByRole('button', { name: 'ดาวน์โหลดไฟล์ (.zip)' }).click()
const x = await rp; let j = {}; try { j = await x.json() } catch {} log('resp', x.status(), JSON.stringify(j).slice(0, 900)); const rec = j.data
log('toast', await toasts(p, 1500)); await sleep(3000); await settle(p)
log('history', await mainText(p, 1500)); await shot(p, R, '28-export-history-v5', { fullPage: true })
if (rec?.id) {
  const res = await p.request.get(`${BASE}/api/accounting/export-history/${rec.id}/download`)
  const b = await res.body(); const fn = `${DL}/export-pack-v${rec.version}.zip`; writeFileSync(fn, b)
  log('dl', res.status(), res.headers()['content-type'], b.length, 'sha256', createHash('sha256').update(b).digest('hex'), fn)
}
log('after', q('select version, status, file_hash, file_urls from export_records order by version'))
log(q(`select action, target_type, reason from audit_logs where target_type='export_records' order by created_at desc limit 3`))
log('5xx', a.serverErrors, a.consoleErrors.slice(0, 3))
await a.browser.close()
