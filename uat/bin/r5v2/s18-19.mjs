// R5.18 ล็อตบริษัท 2 แนบไม่ครบ → ครบ · R5.19 ยืนยันด้วย race 2 context
import { openAs, shot, BASE, settle, sleep, waitToast, dlgText, mainText, log, q, api, fmt, guard2xx, R, SQL, F, LOT2 } from './_h.mjs'
const SA = await openAs('uat.admin')
const page = SA.page
log('=== s18-19', new Date().toISOString())
const res = []
page.on('response', r => { const u = r.url(); if (r.request().method() !== 'GET' && (u.includes('/api/') || u.includes('supabase'))) res.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`) })
const lotQ = `select status,signed_doc_url,left(signed_doc_hash,8) sh,delivery_proof_url,left(delivery_proof_hash,8) ph from handover_lots where id='${LOT2}'`
const openModal = async () => {
  await page.goto(`${BASE}/warehouse`); await settle(page)
  await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await sleep(900)
  const card = page.locator('div', { hasText: 'LOT-2569-004' }).filter({ has: page.getByRole('button', { name: 'แนบเอกสาร', exact: true }) }).last()
  await card.getByRole('button', { name: 'แนบเอกสาร', exact: true }).click(); await sleep(1000)
  return page.locator('[role="dialog"]').last()
}
let dlg = await openModal()
log('R5.18 modal:', await dlgText(page, 1100))
const slot = i => dlg.locator('label', { hasText: /เลือกไฟล์|แนบไฟล์ใหม่แทน/ }).nth(i)
await slot(0).locator('input[type=file]').setInputFiles(F('R5-LOT-CO2-signed.pdf'))
await dlg.getByText('แนบแล้ว ✅').first().waitFor({ timeout: 30000 })
await sleep(500)
log('R5.18 after ①: confirm disabled =', await dlg.getByRole('button', { name: 'ยืนยันส่งมอบสำเร็จ' }).isDisabled())
await shot(page, R, 'R5.18-lot2-signed-only')
await dlg.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(400)
let r = await api(page, 'PATCH', `/api/handover-lots/${LOT2}/confirm`, {}); log('R5.18 confirm partial:', r); guard2xx('R5.18', r)
dlg = await openModal()
log('R5.18 reopen slots:', (await dlgText(page, 1600)).match(/① .{0,400}/)?.[0])
await slot(1).locator('input[type=file]').setInputFiles(F('R5-LOT-CO2-delivery-proof.png'))
await sleep(3500); await settle(page)
log('R5.18 after ②: confirm disabled =', await dlg.getByRole('button', { name: 'ยืนยันส่งมอบสำเร็จ' }).isDisabled(), '| ✅ count', await dlg.getByText('แนบแล้ว ✅').count())
await shot(page, R, 'R5.18-lot2-docs-ready')
log(q(lotQ))
// R5.19 race
const SB = await openAs('uat.admin', { fresh: true })
let raceB
await page.route('**/api/handover-lots/*/confirm', async (route) => {
  raceB = SB.page.request.fetch(`${BASE}/api/handover-lots/${LOT2}/confirm`, { method: 'PATCH', data: route.request().postDataJSON() })
  await route.continue()
})
await dlg.getByRole('button', { name: 'ยืนยันส่งมอบสำเร็จ' }).click()
const tA = await waitToast(page, 20000)
await sleep(1500)
log('R5.19 B:', await fmt(await raceB))
log('R5.19 A toast:', tA, '| dialog:', await dlgText(page, 500))
await shot(page, R, 'R5.19-lot2-race')
if (await page.locator('[role="dialog"]').count()) { await page.keyboard.press('Escape'); await page.reload(); await settle(page) }
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await sleep(1000)
log('R5.19 delivered tab:', await mainText(page, 1400))
await shot(page, R, 'R5.19-delivered-tab', { fullPage: true })
log('R5.18-19 responses:', res)
log('console', SA.consoleErrors, 'server', SA.serverErrors, SB.serverErrors)
await SA.browser.close(); await SB.browser.close()
log(q(lotQ)); log(q(SQL.lot).split('\n').slice(0, 4).join('\n'))
log(q(`select case_ref,asset_status from assets order by 1`)); log(q(`select c.case_ref,x.expense_type,x.status from expenses x join cases c on c.id=x.case_id where c.case_ref='UAT-CO2-005'`))
log(q(SQL.rev)); log(q(SQL.noti))
log(q(`select to_char(created_at,'HH24:MI:SS.MS') t,action,after_data->'events' ev,jsonb_array_length(after_data->'expenseIdsUnlocked') unl,after_data->'revenueIdsCreated' rev,before_data from audit_logs where target_type='handover_lots' and target_id='${LOT2}' order by created_at`))
