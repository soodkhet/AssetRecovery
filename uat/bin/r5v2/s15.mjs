// R5.15 แนบใบเซ็นรับ: ไฟล์ปลอม → v1 → v2 + probe API
import { openAs, shot, BASE, settle, sleep, waitToast, dlgText, log, q, api, guard2xx, R, SQL, F, LOT1, LOT2 } from './_h.mjs'
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.admin')
log('=== s15b', new Date().toISOString())
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && (u.includes('/api/') || u.includes('supabase'))) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 130)}`) })
const lotQ = `select signed_doc_url,signed_doc_hash from handover_lots where id='${LOT1}'`
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await sleep(900)
await page.getByRole('button', { name: 'แนบเอกสาร', exact: true }).first().click(); await sleep(1000)
const dlg = page.locator('[role="dialog"]').last()
const slot = () => dlg.locator('label', { hasText: /เลือกไฟล์|แนบไฟล์ใหม่แทน/ }).nth(0)
// (s15b) ต่อจาก s15 ที่ล้มหลังกด 'ดูไฟล์ที่แนบ' (viewer ซ้อนเป็น dialog ใหม่) — v1 แนบแล้วใน DB
log('R5.15.2b modal reopen:', (await dlgText(page, 1300)).match(/① .{0,200}/)?.[0])
const popP = context.waitForEvent('page', { timeout: 6000 }).catch(() => null)
await dlg.getByRole('button', { name: 'ดูไฟล์ที่แนบ' }).first().click().catch(e => log('view err', e.message)); await sleep(2500)
const pop = await popP; log('R5.15.2b view popup:', pop ? pop.url().replace(/token=[^&]+/, 'token=…').slice(0, 180) : '(none)', '| dialogs:', await page.locator('[role="dialog"]').count())
log('R5.15.2b viewer:', await dlgText(page, 300))
await shot(page, R, 'R5.15-v1-view')
if (pop) await pop.close()
if (await page.locator('[role="dialog"]').count() > 1) { await page.keyboard.press('Escape'); await sleep(600) }
if (await page.locator('[role="dialog"]').count() > 1) { await page.locator('[role="dialog"]').last().getByRole('button', { name: /ปิด/ }).last().click().catch(() => {}); await sleep(600) }
log('R5.15.2b dialogs after close:', await page.locator('[role="dialog"]').count(), (await dlgText(page, 80)))
const V1PATH = 'handover-lots/dc03dc55-7511-4e52-adc7-59760971d5e0/signed-doc/77e65b67-1f6d-4ae1-a99b-cd20d351d281.pdf'
// 3 v2
await slot().locator('input[type=file]').setInputFiles(F('R5-LOT-CO1-signed-v2.pdf'))
await sleep(3000); await settle(page)
log('R5.15.3 modal:', (await dlgText(page, 1300)).match(/① .{0,300}/)?.[0])
await shot(page, R, 'R5.15-v2-attached')
log(q(lotQ))
log('R5.15 responses:', res)
await dlg.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(400)
// 4 probes
for (const [k, b] of [
  ['a', { document: 'signed_doc', fileUrl: `handover-lots/${LOT2}/signed-doc/x.pdf` }],
  ['b', { document: 'signed_doc', fileUrl: `handover-lots/${LOT1}/delivery-proof/x.png` }],
  ['c', { document: 'signed_doc', fileUrl: `handover-lots/${LOT1}/signed-doc/00000000-0000-4000-8000-000000000000.pdf` }],
  ['d', { document: 'signed_doc', fileUrl: V1PATH, fileHash: '0'.repeat(64) }],
]) { const r = await api(page, 'POST', `/api/handover-lots/${LOT1}/documents`, b); log(`R5.15.4 ${k}:`, r); guard2xx(`R5.15.4 ${k}`, r) }
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
const m = await openAs('uat.co1.mgr')
{ const r = await api(m.page, 'POST', `/api/handover-lots/${LOT1}/documents`, { document: 'signed_doc', fileUrl: V1PATH }); log('R5.15.4 e co1.mgr:', r); guard2xx('R5.15.4 e', r) }
await m.browser.close()
log(q(lotQ))
log(q(`select to_char(created_at,'HH24:MI:SS') t,action,before_data,after_data from audit_logs where target_type='handover_lots' and action='update' order by created_at`))
