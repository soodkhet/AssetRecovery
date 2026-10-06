// R14.09 (ต่อ) /accounting รายได้และขาย คอลัมน์เอกสารภาษี · R14.10 portal ดาวน์โหลดใบแจ้งหนี้ (co1.mgr + ธุรการ view-as CO2)
import { openAs, shot, BASE, settle, sleep, log, R, q, mainText, DL, CO2 } from './_h.mjs'
const T = new Date().toISOString()
const a = await openAs('uat.account'); const ap = a.page
await ap.goto(`${BASE}/accounting?tab=sales`); await settle(ap); await sleep(1500)
log('accounting sales url', ap.url())
for (const bl of ['BL-2569-005', 'BL-2569-006']) log('acct row', (await ap.locator('tr').filter({ hasText: bl }).first().innerText().catch(() => 'NO ROW')).replace(/\s+/g, ' '))
await shot(ap, R, '09-accounting-sales', { fullPage: true })
await a.browser.close()
async function portalDl(p, path, bl, tag) {
  await p.goto(`${BASE}${path}`); await settle(p); await sleep(1500)
  log(`${tag} ${path}`, p.url(), await mainText(p, 1000))
  const row = p.locator('tr,li,div[role=row]').filter({ hasText: bl }).first()
  log('row', (await row.innerText().catch(() => 'NO ROW')).replace(/\s+/g, ' '))
  await shot(p, R, `10-${tag}-billing`, { fullPage: true })
  const btn = row.getByRole('button', { name: /ใบแจ้งหนี้|ดาวน์โหลด|PDF/ }).or(row.getByRole('link', { name: /ใบแจ้งหนี้|ดาวน์โหลด|PDF/ })).first()
  if (!(await btn.count())) { log('!! ไม่พบปุ่มดาวน์โหลดในแถว', (await row.locator('button,a').allInnerTexts()).join('|')); return }
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), btn.click()])
  const out = `${DL}/portal-${tag}-${dl.suggestedFilename()}`; await dl.saveAs(out); log('saved', out)
}
const c = await openAs('uat.co1.mgr')
await portalDl(c.page, '/portal/billing', 'BL-2569-005', 'co1mgr')
log('5xx', c.serverErrors); await c.browser.close()
const u = await openAs('uat.admin')
await portalDl(u.page, `/portal/view-as/${CO2}/billing`, 'BL-2569-006', 'viewas-co2')
log('5xx', u.serverErrors); await u.browser.close()
log(q(`select a.action,a.target_type,a.actor_role,left(a.after_data::text,300) from audit_logs a where a.created_at>'${T}' and a.action not in ('login') order by a.created_at`))
