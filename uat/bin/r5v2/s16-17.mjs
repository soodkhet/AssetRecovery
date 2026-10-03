// R5.16 ยืนยันล็อตบริษัท 1 (ดับเบิลคลิก) · R5.17 probe หลังยืนยัน + modal เอกสาร
import { openAs, shot, BASE, settle, sleep, waitToast, dlgText, mainText, log, q, api, guard2xx, R, SQL, A, CO1, LOT1 } from './_h.mjs'
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.admin')
log('=== s16-17', new Date().toISOString())
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && u.includes('/api/')) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`) })
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await sleep(900)
await page.getByRole('button', { name: 'ดูรายการ' }).first().click(); await sleep(1000)
await page.getByRole('button', { name: 'แนบเอกสาร & ยืนยัน' }).click(); await sleep(1000)
const dlg = page.locator('[role="dialog"]').last()
log('R5.16 delivered default:', await dlg.locator('input[type=datetime-local]').inputValue(), '| slot:', (await dlgText(page, 1200)).match(/① .{0,120}/)?.[0])
const btn = dlg.getByRole('button', { name: 'ยืนยันส่งมอบสำเร็จ' })
log('R5.16 btn disabled:', await btn.isDisabled())
await btn.dblclick()
log('R5.16 toast:', await waitToast(page, 20000))
await settle(page); await sleep(1500)
log('R5.16 tabs:', JSON.stringify(await page.getByRole('tab').allInnerTexts()))
log('R5.16 main:', await mainText(page, 1000))
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await sleep(1000)
log('R5.16 delivered tab:', await mainText(page, 1400))
await shot(page, R, 'R5.16-lot1-confirmed', { fullPage: true })
log('R5.16 responses:', res)
// R5.17
const B = { imeiActual: '356789100000011', condition: 'normal', photos: [] }
const V1PATH = 'handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/778bc708-6e6b-4b6d-b37c-5a3dad55696f.pdf'
const TODAY = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
for (const [k, m, p, b] of [
  ['a', 'PATCH', `/api/handover-lots/${LOT1}/confirm`, {}],
  ['b', 'POST', `/api/handover-lots/${LOT1}/documents`, { document: 'signed_doc', fileUrl: V1PATH }],
  ['c', 'POST', '/api/handover-lots', { companyId: CO1, type: 'finance_pickup', scheduledAt: `${TODAY}T10:00:00+07:00`, assetIds: [A.C1] }],
  ['d', 'POST', `/api/assets/${A.C1}/intake`, B],
]) { const r = await api(page, m, p, b); log(`R5.17 ${k}:`, r); guard2xx(`R5.17 ${k}`, r) }
const card = page.locator('div', { hasText: 'LOT-2569-003' }).filter({ has: page.getByRole('button', { name: 'เอกสาร', exact: true }) }).last()
log('R5.17 card buttons:', JSON.stringify(await card.getByRole('button').allInnerTexts()))
await card.getByRole('button', { name: 'เอกสาร', exact: true }).click(); await sleep(1000)
log('R5.17 docs modal:', await dlgText(page, 900))
await shot(page, R, 'R5.17-lot1-docs')
await page.locator('[role="dialog"]').last().getByRole('button', { name: 'ปิด', exact: true }).click().catch(() => page.keyboard.press('Escape')); await sleep(500)
await card.getByRole('button', { name: 'ดูรายการ' }).click(); await sleep(1000)
log('R5.17 detail buttons:', JSON.stringify(await page.locator('main button, main a').allInnerTexts()).slice(0, 400))
await shot(page, R, 'R5.17-lot1-detail')
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
log(q(SQL.lot)); log(q(SQL.asset)); log(q(SQL.ex)); log(q(SQL.rev)); log(q(SQL.noti))
log(q(`select to_char(created_at,'HH24:MI:SS.MS') t,action,after_data from audit_logs where target_type='handover_lots' and action='confirm' order by created_at`))
