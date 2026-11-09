import { mkdirSync, rmdirSync, writeFileSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const SP = '/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6'
const L001 = 'a7940379-d731-4392-acaa-5a1defde888f', L002 = '629357a1-cb9c-4fee-9d26-463c7dc5ffd5', L003 = '3b22c0aa-3f2e-4f7e-bcba-bacc421c4647', L004 = 'ac889547-f776-45ab-bfc1-78d2ff3eb072', L005 = '1694237b-f379-4659-a01c-bde1487ac64d'
const personas = (process.argv[2] ?? 'uat.agent.in1,uat.approver,uat.mgr.in,uat.finance,uat.co1.mgr').split(',')
const out = {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
for (const p of personas) {
  const lock = `${SP}/locks/${p}`
  for (let i = 0; i < 60; i++) { try { mkdirSync(lock); break } catch { await sleep(5000) } }
  let s
  try {
    s = await openAs(p, { mobile: p.startsWith('uat.agent') })
    const { page, context } = s
    const r = {}
    await page.goto(BASE + '/warehouse?tab=handed_over'); await page.waitForTimeout(3500)
    r.warehouseUrl = page.url().replace(BASE, '')
    r.warehouseText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)
    r.menuHasWarehouse = await page.getByRole('link', { name: 'คลังสินค้า' }).count()
    await page.screenshot({ path: `${SP}/E/shots/E7-perm-${p}.png` })
    const api = []
    for (const u of ['/api/assets?tab=in_custody', '/api/assets?tab=handed_over', '/api/handover-lots', `/api/handover-lots/${L001}`, `/api/handover-lots/${L001}/pdf`, `/api/handover-lots/${L003}/export-excel`]) {
      const res = await context.request.get(BASE + u); const t = (await res.text()).slice(0, 160)
      api.push(`${res.status()} GET ${u.replace(/[0-9a-f-]{36}/, (m) => m.slice(0, 8))} :: ${res.headers()['content-type']?.includes('json') ? t : '(' + res.headers()['content-type'] + ')'}`)
    }
    // write probes (ต้องโดนปฏิเสธ)
    const w = await page.evaluate(async ({ L }) => { const f = async (m, u, b) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return `${r.status} ${m} ${u.replace(/[0-9a-f-]{36}/, x => x.slice(0, 8))} :: ${(await r.text()).slice(0, 120)}` }
      return [await f('POST', '/api/assets/3131b9dd-6483-47bc-9b77-3b21a50b1eb5/intake', { imeiActual: '350002355101302', condition: 'normal', colorCapacityMatched: true, photos: [] }), await f('POST', '/api/handover-lots', { companyId: '50707134-993b-4618-9287-2a8c7ab9b0fa', assetIds: [], type: 'finance_pickup', scheduledAt: new Date().toISOString() }), await f('PATCH', `/api/handover-lots/${L}/confirm`, { deliveredAt: new Date().toISOString() })] }, { L: L001 })
    r.api = api; r.writes = w
    if (p.startsWith('uat.co')) {
      await page.goto(BASE + '/portal/handover'); await page.waitForTimeout(3500)
      r.portalUrl = page.url().replace(BASE, '')
      r.portalText = (await page.locator('main').innerText().catch(() => page.locator('body').innerText())).replace(/\s+/g, ' ').slice(0, 900)
      await page.screenshot({ path: `${SP}/E/shots/E6-portal-${p}.png`, fullPage: true })
      const pa = []
      for (const id of [L001, L005, L002, L003, L004]) { const res = await context.request.get(BASE + '/api/portal/handover-lots/' + id); pa.push(`${id.slice(0, 8)} ${res.status()} ${(await res.text()).slice(0, 90)}`) }
      const lst = await context.request.get(BASE + '/api/portal/handover-lots'); const lj = await lst.text()
      r.portalApi = pa; r.portalList = lst.status() + ' ' + (lj.match(/LOT-2569-\d{3}/g) ?? []).join(',')
    }
    r.consoleErrors = s.consoleErrors.slice(0, 5); r.serverErrors = s.serverErrors.slice(0, 5)
    out[p] = r
  } catch (e) { out[p] = { error: String(e?.message ?? e).slice(0, 300) } }
  finally { try { await s?.browser.close() } catch {} try { rmdirSync(lock) } catch {} }
}
writeFileSync(`${SP}/E/perm.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
