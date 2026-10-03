// R5.15 (เติม) ไฟล์ปลอม → v1 → v2 อีกครั้ง (s15 ที่คัดลอกมาเป็นรุ่นต่อ "b" ข้ามปลอม/v1 ไป v2 ตรง) + probe d ด้วย V1PATH จริง
import { openAs, shot, BASE, settle, sleep, waitToast, dlgText, log, q, api, guard2xx, R, F, LOT1 } from './_h.mjs'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.admin')
log('=== s15c', new Date().toISOString())
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && (u.includes('/api/') || u.includes('supabase'))) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 130)}`) })
const lotQ = `select signed_doc_url,signed_doc_hash from handover_lots where id='${LOT1}'`
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await sleep(900)
await page.getByRole('button', { name: 'แนบเอกสาร', exact: true }).first().click(); await sleep(1000)
const dlg = page.locator('[role="dialog"]').last()
const slot = () => dlg.locator('label', { hasText: /เลือกไฟล์|แนบไฟล์ใหม่แทน/ }).nth(0)
// 1 fake
await slot().locator('input[type=file]').setInputFiles(F('R5-fake-signed.pdf'))
log('R5.15.1 toast:', await waitToast(page)); await sleep(800)
await shot(page, R, 'R5.15-fake-signed')
log(q(lotQ))
// 2 v1
await slot().locator('input[type=file]').setInputFiles(F('R5-LOT-CO1-signed-v1.pdf'))
log('R5.15.2 toast:', await waitToast(page)); await sleep(2000); await settle(page)
log('R5.15.2 modal:', (await dlgText(page, 1300)).match(/① .{0,250}/)?.[0])
await shot(page, R, 'R5.15-v1-attached')
const v1 = q(lotQ); log(v1)
const V1PATH = v1.match(/handover-lots\/\S+\.pdf/)[0]
// 3 v2
await slot().locator('input[type=file]').setInputFiles(F('R5-LOT-CO1-signed-v2.pdf'))
log('R5.15.3 toast:', await waitToast(page)); await sleep(2000); await settle(page)
await shot(page, R, 'R5.15-v2-attached')
log(q(lotQ))
await dlg.getByRole('button', { name: 'ยกเลิก' }).click().catch(() => {}); await sleep(400)
log('R5.15 responses:', res)
const r = await api(page, 'POST', `/api/handover-lots/${LOT1}/documents`, { document: 'signed_doc', fileUrl: V1PATH, fileHash: '0'.repeat(64) })
log('R5.15.4 d (V1PATH):', r); guard2xx('R5.15.4 d', r)
log('V1PATH', V1PATH)
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
log(q(lotQ))
log(q(`select to_char(created_at,'HH24:MI:SS') t,before_data->>'fileUrl' bf,before_data->>'fileHash' bh,after_data->>'fileUrl' af,after_data->>'fileHash' ah from audit_logs where target_type='handover_lots' and action='update' order by created_at`))
