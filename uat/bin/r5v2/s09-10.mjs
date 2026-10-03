// R5.09 แท็บในคลัง/วันเวลา/รายละเอียด · R5.10 probe สร้างล็อตทาง API
import { openAs, shot, BASE, settle, sleep, dlgText, mainText, log, q, api, guard2xx, R, SQL, A, CO1, CO2, RND } from './_h.mjs'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.admin')
log('=== s09-10', new Date().toISOString())
await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(600)
log('R5.09 intake tab:', await mainText(page, 600))
await page.getByRole('tab', { name: /^ในคลัง/ }).click(); await sleep(1000); await settle(page)
log('R5.09 custody cards:', await mainText(page, 900))
await shot(page, R, 'R5.09-custody-cards', { fullPage: true })
await page.getByText('บริษัท ยูเอที ลิสซิ่ง จำกัด').last().click(); await sleep(1000); await settle(page)
log('R5.09 drill CO1:', await mainText(page, 1500))
log('R5.09 cross-company rows in CO1 drill:', await page.locator('tr', { hasText: 'UAT-CO2-005' }).count())
await shot(page, R, 'R5.09-custody-co1', { fullPage: true })
await page.locator('tr', { hasText: 'UAT-CO1-001' }).first().getByRole('button', { name: 'ดู', exact: true }).click(); await sleep(1500)
log('R5.09 asset detail:', await dlgText(page, 1500))
const imgs = await page.locator('[role="dialog"] img').evaluateAll(els => els.map(e => ({ src: e.currentSrc.slice(0, 120), ok: e.complete && e.naturalWidth > 0 })))
log('R5.09 imgs:', imgs.length, imgs.filter(i => i.ok).length, imgs[0]?.src)
await shot(page, R, 'R5.09-asset-detail')
await page.keyboard.press('Escape'); await sleep(500)
// R5.10
const TODAY = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
const L = { companyId: CO1, type: 'finance_pickup', scheduledAt: `${TODAY}T10:00:00+07:00` }
const probes = [
  ['a', { ...L, assetIds: [] }],
  ['b', { ...L, assetIds: [A.C1, A.C5] }],
  ['c', { ...L, assetIds: [A.C5] }],
  ['d', { ...L, assetIds: [RND] }],
  ['e', { ...L, assetIds: [A.C1, A.C1] }],
  ['f', { companyId: CO2, assetIds: [A.C5], type: 'we_deliver', scheduledAt: `${TODAY}T10:00:00+07:00`, deliveryAddr: null }],
  ['g', { ...L, assetIds: [A.C1], scheduledAt: '2569-10-04T10:00:00+07:00' }],
]
for (const [k, b] of probes) { const r = await api(page, 'POST', '/api/handover-lots', b); log(`R5.10 ${k}:`, r); guard2xx(`R5.10 ${k}`, r) }
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
const m = await openAs('uat.co1.mgr')
{ const r = await api(m.page, 'POST', '/api/handover-lots', { ...L, assetIds: [A.C1] }); log('R5.10 h co1.mgr:', r); guard2xx('R5.10 h', r) }
await m.browser.close()
log(q('select count(*) lots from handover_lots'))
try { log(q(SQL.seq)) } catch (e) { log('seq:', String(e.stderr ?? e.message).split('\n').find(l => l.includes('ERROR'))) }
log(q(`select case_ref,asset_status,lot_id from assets order by 1`))
log(q(`select count(*) audit_after_c5 from audit_logs where created_at > '2026-10-03 18:43:20+00' and action not in ('login','logout')`))
log(q(SQL.ex))
