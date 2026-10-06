// R14.22 AR ภายใน = portal + portal เห็นใบเสร็จรับเงิน/ใบกำกับภาษี (co1.mgr · ธุรการ view-as CO2)
import { openAs, shot, BASE, settle, sleep, log, R, q, mainText, DL, CO2 } from './_h.mjs'
const T = new Date().toISOString()
const f = await openAs('uat.finance'); const fp = f.page
await fp.goto(`${BASE}/finance?tab=revenue`); await settle(fp); await sleep(1200)
log('finance AR', (await mainText(fp, 400)).split('|').slice(12, 18).join('|'))
for (const bl of ['BL-2569-005', 'BL-2569-006']) log('internal', (await fp.locator('tr').filter({ hasText: bl }).first().innerText()).replace(/\s+/g, ' '))
await shot(fp, R, '22-finance-ar', { fullPage: true }); await f.browser.close()
async function portal(p, base, tag, bl, invs) {
  await p.goto(`${BASE}${base}`); await settle(p); await sleep(1500)
  log(`${tag} overview`, (await mainText(p, 500)))
  await p.goto(`${BASE}${base}/billing`); await settle(p); await sleep(1500)
  log(`${tag} billing row`, (await p.locator('tr').filter({ hasText: bl }).first().innerText()).replace(/\s+/g, ' '))
  await shot(p, R, `22-${tag}-billing`, { fullPage: true })
  await p.goto(`${BASE}${base}/tax-invoices`); await settle(p); await sleep(1500)
  log(`${tag} tax-invoices`, await mainText(p, 1500))
  await shot(p, R, `22-${tag}-tax-invoices`, { fullPage: true })
  for (const inv of invs) {
    const row = p.locator('tr').filter({ hasText: inv }).first()
    const b = row.getByRole('button', { name: /PDF|ดาวน์โหลด/ }).or(row.getByRole('link', { name: /PDF|ดาวน์โหลด/ })).first()
    if (!(await b.count())) { log('!! no download', inv); continue }
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), b.click()])
    const out = `${DL}/22-portal-${tag}-${d.suggestedFilename()}`; await d.saveAs(out); log('saved', out)
  }
}
const c = await openAs('uat.co1.mgr'); await portal(c.page, '/portal', 'co1mgr', 'BL-2569-005', ['INV-0008']); log('5xx', c.serverErrors); await c.browser.close()
const u = await openAs('uat.admin'); await portal(u.page, `/portal/view-as/${CO2}`, 'viewas-co2', 'BL-2569-006', ['INV-0006', 'INV-0007']); log('5xx', u.serverErrors); await u.browser.close()
log(q(`select a.actor_role,left(a.after_data::text,220) from audit_logs a where a.created_at>'${T}' and a.action='export' order by a.created_at`))
